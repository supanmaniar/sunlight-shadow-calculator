import rawScenes from "@/data/scenes.json";
import {
  inferBuildingHeight,
  inferTreeSize,
  type Building,
  type SceneData,
  type Tree,
} from "./osm";

type RawScene = {
  center: [number, number];
  radius: number;
  buildings: {
    id: number;
    footprint: [number, number][];
    tags: Record<string, string>;
  }[];
  trees: { id: number; center: [number, number]; tags: Record<string, string> }[];
};

const scenes = rawScenes as unknown as Record<string, RawScene>;

/** Radius (degrees) within which a bundled scene is considered a match. */
const MATCH_RADIUS_DEG = 0.01;

function toSceneData(raw: RawScene): SceneData {
  const buildings: Building[] = raw.buildings.map((building) => ({
    id: building.id,
    footprint: building.footprint,
    height: inferBuildingHeight(building.tags),
    minHeight: 0,
    kind: building.tags.building ?? "yes",
  }));

  const trees: Tree[] = raw.trees.map((tree) => {
    const { height, crownRadius } = inferTreeSize(tree.tags);
    return { id: tree.id, center: tree.center, height, crownRadius };
  });

  return {
    center: raw.center,
    radius: raw.radius,
    buildings,
    trees,
    fetchedAt: "2026-10-31T00:00:00.000Z",
    source: "overpass",
  };
}

/**
 * Real OpenStreetMap extracts bundled with the app so the 3D view works even
 * when the public Overpass API is rate limited.
 */
export function getBundledScene(
  latitude: number,
  longitude: number,
): SceneData | null {
  for (const raw of Object.values(scenes)) {
    const [lng, lat] = raw.center;
    if (
      Math.abs(lat - latitude) < MATCH_RADIUS_DEG &&
      Math.abs(lng - longitude) < MATCH_RADIUS_DEG
    ) {
      return toSceneData(raw);
    }
  }
  return null;
}

/** Names of the areas that have bundled data, for UI hints. */
export function bundledSceneNames(): string[] {
  return Object.keys(scenes);
}
