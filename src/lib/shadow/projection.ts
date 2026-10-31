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
 * east/north. The shadow polygon is the convex hull of the original footprint
 * and the translated footprint, which is exact for convex footprints and a
 * good approximation for the concave ones typical of OSM buildings.
 */

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

/**
 * Shadow footprint for a building outline. Returns `null` when the sun is at or
 * below the horizon, or when the footprint is degenerate.
 */
export function buildingShadow(
  footprint: LngLat[],
  height: number,
  azimuth: number,
  elevation: number,
): LngLat[] | null {
  if (elevation <= 0 || height <= 0 || footprint.length < 3) return null;

  const { east, north } = shadowOffset(height, azimuth, elevation);
  if (east === 0 && north === 0) return null;

  const translated = footprint.map((point) =>
    offsetToLngLat(point, east, north),
  );

  const hull = convexHull(footprint.concat(translated));
  return hull.length >= 3 ? hull : null;
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
