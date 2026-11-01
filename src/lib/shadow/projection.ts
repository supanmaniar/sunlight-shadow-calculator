/**
 * Shadow projection for extruded geometry.
 *
 * A building of height `h` casts a shadow whose footprint is the building's
 * outline translated by the horizontal displacement of the sun ray:
 *
 *   dx = h / tan(elevation) * sin(azimuth)
 *   dy = h / tan(elevation) * cos(azimuth)
 *
 * where azimuth is degrees clockwise from north and the result is in metres
 * east/north. The shadow region is the footprint swept along that vector. For
 * convex footprints this equals the convex hull of the footprint and its
 * translation; concave footprints are swept exactly so their concavity is not
 * filled in.
 */

import polygonClipping from "polygon-clipping";

export type LngLat = [number, number];

const METRES_PER_DEGREE_LAT = 111_320;

export function metresPerDegreeLng(latitude: number): number {
  return METRES_PER_DEGREE_LAT * Math.cos((latitude * Math.PI) / 180);
}

/** Horizontal shadow displacement in metres for a given height and sun angle. */
export function shadowOffset(
  height: number,
  azimuth: number,
  elevation: number,
): { east: number; north: number } {
  if (elevation <= 0 || height <= 0) return { east: 0, north: 0 };
  const length = height / Math.tan((elevation * Math.PI) / 180);
  // The shadow falls opposite the sun, i.e. along azimuth + 180°.
  const azimuthRad = (azimuth * Math.PI) / 180;
  return {
    east: -length * Math.sin(azimuthRad),
    north: -length * Math.cos(azimuthRad),
  };
}

/** Convert a local east/north metre offset into a longitude/latitude delta. */
export function offsetToLngLat(
  origin: LngLat,
  east: number,
  north: number,
): LngLat {
  const [lng, lat] = origin;
  return [
    lng + east / metresPerDegreeLng(lat),
    lat + north / METRES_PER_DEGREE_LAT,
  ];
}

/** Andrew's monotone chain convex hull. Returns counter-clockwise points. */
export function convexHull(points: LngLat[]): LngLat[] {
  if (points.length < 3) return points.slice();

  const sorted = points
    .slice()
    .sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));

  const cross = (o: LngLat, a: LngLat, b: LngLat) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const lower: LngLat[] = [];
  for (const point of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0
    ) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper: LngLat[] = [];
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const point = sorted[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0
    ) {
      upper.pop();
    }
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** A shadow polygon: one outer ring plus any interior holes. */
export type ShadowPolygon = { outer: LngLat[]; holes: LngLat[][] };

/** Above this vertex count the exact sweep is skipped in favour of the hull. */
const MAX_SWEEP_VERTICES = 120;

function toMetres(point: LngLat, origin: LngLat): [number, number] {
  return [
    (point[0] - origin[0]) * metresPerDegreeLng(origin[1]),
    (point[1] - origin[1]) * METRES_PER_DEGREE_LAT,
  ];
}

function fromMetres(point: [number, number], origin: LngLat): LngLat {
  return [
    origin[0] + point[0] / metresPerDegreeLng(origin[1]),
    origin[1] + point[1] / METRES_PER_DEGREE_LAT,
  ];
}

/** True when the ring equals its own convex hull, i.e. it has no concavity. */
function isConvexRing(ring: LngLat[]): boolean {
  const hull = convexHull(ring);
  if (hull.length < 3) return false;
  return polygonArea(hull) <= polygonArea(ring) * 1.001;
}

/**
 * Shadow footprint for a building outline.
 *
 * The true shadow is the footprint swept along the shadow vector, i.e.
 * `P ∪ (P + v) ∪ ⋃ quads(edge_i, edge_i + v)`. For a convex footprint that
 * region is exactly the convex hull of `P ∪ (P + v)`, so the cheap hull is
 * used. For concave footprints the hull fills the concavity and inflates the
 * shadow, so the exact swept region is computed instead.
 *
 * Returns `null` when the sun is at or below the horizon, or when the footprint
 * is degenerate.
 */
export function buildingShadow(
  footprint: LngLat[],
  height: number,
  azimuth: number,
  elevation: number,
): ShadowPolygon[] | null {
  if (elevation <= 0 || height <= 0 || footprint.length < 3) return null;

  const { east, north } = shadowOffset(height, azimuth, elevation);
  if (east === 0 && north === 0) return null;

  const translated = footprint.map((point) =>
    offsetToLngLat(point, east, north),
  );

  const hull = convexHull(footprint.concat(translated));
  if (hull.length < 3) return null;

  if (isConvexRing(footprint) || footprint.length > MAX_SWEEP_VERTICES) {
    return [{ outer: hull, holes: [] }];
  }

  const origin = footprint[0];
  const base = footprint.map((point) => toMetres(point, origin));
  const moved = base.map((point): [number, number] => [
    point[0] + east,
    point[1] + north,
  ]);

  const parts: [number, number][][][] = [[base], [moved]];
  for (let i = 0; i < base.length; i += 1) {
    const j = (i + 1) % base.length;
    parts.push([[base[i], base[j], moved[j], moved[i], base[i]]]);
  }

  let unioned: [number, number][][][];
  try {
    unioned = polygonClipping.union(parts[0], ...parts.slice(1));
  } catch {
    // Degenerate geometry: fall back to the hull rather than dropping the shadow.
    return [{ outer: hull, holes: [] }];
  }

  const polygons: ShadowPolygon[] = [];
  for (const polygon of unioned) {
    const [outerRing, ...holeRings] = polygon;
    if (!outerRing || outerRing.length < 3) continue;
    polygons.push({
      outer: outerRing.map((point) => fromMetres(point, origin)),
      holes: holeRings
        .filter((ring) => ring.length >= 3)
        .map((ring) => ring.map((point) => fromMetres(point, origin))),
    });
  }

  return polygons.length > 0 ? polygons : [{ outer: hull, holes: [] }];
}

/** Circular shadow footprint for a tree of a given crown radius. */
export function treeShadow(
  center: LngLat,
  crownRadius: number,
  trunkHeight: number,
  azimuth: number,
  elevation: number,
  segments = 16,
): LngLat[] | null {
  if (elevation <= 0 || crownRadius <= 0) return null;

  const { east, north } = shadowOffset(trunkHeight, azimuth, elevation);
  const shadowCenter = offsetToLngLat(center, east, north);

  const points: LngLat[] = [];
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(
      offsetToLngLat(
        shadowCenter,
        Math.cos(angle) * crownRadius,
        Math.sin(angle) * crownRadius,
      ),
    );
  }
  return points;
}

/** Approximate ground area of a polygon in square metres. */
export function polygonArea(points: LngLat[]): number {
  if (points.length < 3) return 0;
  const lat = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  const scaleX = metresPerDegreeLng(lat);
  const scaleY = METRES_PER_DEGREE_LAT;

  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    area += x1 * scaleX * (y2 * scaleY) - x2 * scaleX * (y1 * scaleY);
  }
  return Math.abs(area) / 2;
}
