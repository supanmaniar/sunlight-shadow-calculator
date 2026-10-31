import type { LngLat } from "./projection";

export type Building = {
  id: number;
  footprint: LngLat[];
  height: number;
  minHeight: number;
  kind: string;
};

export type Tree = {
  id: number;
  center: LngLat;
  height: number;
  crownRadius: number;
};

export type SceneData = {
  center: LngLat;
  radius: number;
  buildings: Building[];
  trees: Tree[];
  fetchedAt: string;
  source: "overpass" | "protomaps";
};

const DEFAULT_BUILDING_HEIGHT = 8;
const METRES_PER_LEVEL = 3.2;
const DEFAULT_TREE_HEIGHT = 8;
const DEFAULT_CROWN_RADIUS = 2.5;

function parseMetres(value: string | undefined): number | null {
  if (!value) return null;
  const match = /-?\d+(\.\d+)?/.exec(value);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Best-effort building height from OSM tags, in metres. */
export function inferBuildingHeight(tags: Record<string, string>): number {
  const explicit = parseMetres(tags.height);
  if (explicit !== null) return explicit;

  const levels = parseMetres(tags["building:levels"]);
  if (levels !== null) {
    const roofLevels = parseMetres(tags["roof:levels"]) ?? 0;
    return (levels + roofLevels) * METRES_PER_LEVEL;
  }

  return DEFAULT_BUILDING_HEIGHT;
}

/** Best-effort tree height and crown radius from OSM tags, in metres. */
export function inferTreeSize(tags: Record<string, string>): {
  height: number;
  crownRadius: number;
} {
  const height = parseMetres(tags.height) ?? DEFAULT_TREE_HEIGHT;

  const diameterCrown = parseMetres(tags.diameter_crown);
  if (diameterCrown !== null) {
    return { height, crownRadius: diameterCrown / 2 };
  }

  const circumference = parseMetres(tags.circumference);
  if (circumference !== null) {
    return { height, crownRadius: circumference / (2 * Math.PI) };
  }

  return { height, crownRadius: DEFAULT_CROWN_RADIUS };
}

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
};

export function buildOverpassQuery(
  latitude: number,
  longitude: number,
  radius: number,
): string {
  const around = `(around:${Math.round(radius)},${latitude},${longitude})`;
  return `[out:json][timeout:25];
(
  way["building"]${around};
  node["natural"="tree"]${around};
);
out tags geom;`;
}

/** Convert an Overpass response into the scene format used by the map. */
export function parseOverpassResponse(payload: unknown): {
  buildings: Building[];
  trees: Tree[];
} {
  const elements = (payload as { elements?: OverpassElement[] })?.elements ?? [];
  const buildings: Building[] = [];
  const trees: Tree[] = [];

  for (const element of elements) {
    const tags = element.tags ?? {};

    if (element.type === "way" && tags.building && element.geometry) {
      const footprint: LngLat[] = element.geometry
        .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon))
        .map((point) => [point.lon, point.lat]);

      if (footprint.length < 3) continue;

      buildings.push({
        id: element.id,
        footprint,
        height: inferBuildingHeight(tags),
        minHeight: parseMetres(tags["building:min_height"]) ?? 0,
        kind: tags.building,
      });
      continue;
    }

    if (
      element.type === "node" &&
      tags.natural === "tree" &&
      Number.isFinite(element.lat) &&
      Number.isFinite(element.lon)
    ) {
      const { height, crownRadius } = inferTreeSize(tags);
      trees.push({
        id: element.id,
        center: [element.lon as number, element.lat as number],
        height,
        crownRadius,
      });
    }
  }

  return { buildings, trees };
}
