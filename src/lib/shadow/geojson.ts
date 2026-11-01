import type { Building, Tree } from "./osm";
import { buildingShadow, treeShadow, type LngLat } from "./projection";

export type ShadowFeature = {
  type: "Feature";
  properties: { kind: "building" | "tree"; height: number };
  geometry: { type: "Polygon"; coordinates: LngLat[][] };
};

export type ShadowCollection = {
  type: "FeatureCollection";
  features: ShadowFeature[];
};

/** Build the shadow polygons for every building and tree in the scene. */
export function buildShadowCollection(
  buildings: Building[],
  trees: Tree[],
  azimuth: number,
  elevation: number,
): ShadowCollection {
  const features: ShadowFeature[] = [];

  if (elevation > 0) {
    for (const building of buildings) {
      const polygon = buildingShadow(
        building.footprint,
        building.height,
        azimuth,
        elevation,
      );
      if (!polygon) continue;
      features.push({
        type: "Feature",
        properties: { kind: "building", height: building.height },
        geometry: { type: "Polygon", coordinates: [[...polygon, polygon[0]]] },
      });
    }

    for (const tree of trees) {
      const polygon = treeShadow(
        tree.center,
        tree.crownRadius,
        tree.height,
        azimuth,
        elevation,
      );
      if (!polygon) continue;
      features.push({
        type: "Feature",
        properties: { kind: "tree", height: tree.height },
        geometry: { type: "Polygon", coordinates: [[...polygon, polygon[0]]] },
      });
    }
  }

  return { type: "FeatureCollection", features };
}

/** GeoJSON for the extruded buildings. */
export function buildBuildingCollection(buildings: Building[]) {
  return {
    type: "FeatureCollection" as const,
    features: buildings.map((building) => ({
      type: "Feature" as const,
      properties: {
        id: building.id,
        height: building.height,
        minHeight: building.minHeight,
        kind: building.kind,
      },
      geometry: {
        type: "Polygon" as const,
        coordinates: [[...building.footprint, building.footprint[0]]],
      },
    })),
  };
}

/** GeoJSON points for trees, with height and crown radius as properties. */
export function buildTreeCollection(trees: Tree[]) {
  return {
    type: "FeatureCollection" as const,
    features: trees.map((tree) => ({
      type: "Feature" as const,
      properties: {
        id: tree.id,
        height: tree.height,
        crownRadius: tree.crownRadius,
      },
      geometry: { type: "Point" as const, coordinates: tree.center },
    })),
  };
}

/**
 * Points along the sun's path for the given day, sampled hourly. Only points
 * above the horizon are returned, so the arc starts and ends at sunrise/sunset.
 */
export function buildSunPath(
  latitude: number,
  longitude: number,
  dateKey: string,
  positionAt: (date: Date) => { azimuth: number; elevation: number },
  radiusMetres = 120,
): LngLat[] {
  const points: LngLat[] = [];
  const start = new Date(`${dateKey}T00:00:00Z`);

  for (let minute = 0; minute <= 24 * 60; minute += 10) {
    const instant = new Date(start.getTime() + minute * 60_000);
    const { azimuth, elevation } = positionAt(instant);
    if (elevation <= 0) continue;

    const azimuthRad = (azimuth * Math.PI) / 180;
    const east = radiusMetres * Math.sin(azimuthRad);
    const north = radiusMetres * Math.cos(azimuthRad);
    const metresPerDegreeLng = 111_320 * Math.cos((latitude * Math.PI) / 180);

    points.push([
      longitude + east / metresPerDegreeLng,
      latitude + north / 111_320,
    ]);
  }

  return points;
}

/**
 * Sun paths for several dates, so the seasonal drift is visible at a glance.
 *
 * Photographers plan weeks or months ahead: seeing that the sun sets 40° further
 * north in June than in December is the whole point of a date range.
 *
 * Returns one LineString per sampled date, plus the date it represents so the
 * caller can label or colour them.
 */
export function buildSunPathRange(
  latitude: number,
  longitude: number,
  dates: string[],
  positionAt: (date: Date) => { azimuth: number; elevation: number },
  radiusMetres = 120,
): { date: string; points: LngLat[] }[] {
  return dates.map((date) => ({
    date,
    points: buildSunPath(latitude, longitude, date, positionAt, radiusMetres),
  }));
}

/** Evenly spaced dates across a year, e.g. the 21st of each month. */
export function monthlyDates(year: number): string[] {
  return Array.from({ length: 12 }, (_, month) => {
    const mm = String(month + 1).padStart(2, "0");
    return `${year}-${mm}-21`;
  });
}
