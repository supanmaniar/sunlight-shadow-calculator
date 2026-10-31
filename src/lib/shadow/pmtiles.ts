import { PMTiles, FetchSource } from "pmtiles";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import type { LngLat } from "./projection";
import type { Building, SceneData, Tree } from "./osm";

/**
 * Protomaps planet archive. Served over HTTP range requests, so only the tiles
 * we ask for are transferred — no download, no API key, no rate limit.
 */
export const PMTILES_URL = "https://build.protomaps.com/20261030.pmtiles";

/** Protomaps stores individual buildings from z15 upward. */
export const BUILDING_ZOOM = 15;

const DEFAULT_BUILDING_HEIGHT = 8;

let archive: PMTiles | null = null;

function getArchive(): PMTiles {
  if (!archive) {
    archive = new PMTiles(new FetchSource(PMTILES_URL));
  }
  return archive;
}

/** Web Mercator tile coordinates for a lon/lat at a zoom level. */
export function lngLatToTile(
  longitude: number,
  latitude: number,
  zoom: number,
): { x: number; y: number; z: number } {
  const n = 2 ** zoom;
  const latRad = (latitude * Math.PI) / 180;
  return {
    x: Math.floor(((longitude + 180) / 360) * n),
    y: Math.floor(
      ((1 -
        Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) /
        2) *
        n,
    ),
    z: zoom,
  };
}

/** All tiles covering a radius (metres) around a point at a zoom level. */
export function tilesCoveringRadius(
  longitude: number,
  latitude: number,
  radiusMetres: number,
  zoom: number,
): { x: number; y: number; z: number }[] {
  const latDelta = radiusMetres / 111_320;
  const lngDelta =
    radiusMetres / (111_320 * Math.cos((latitude * Math.PI) / 180));

  const topLeft = lngLatToTile(longitude - lngDelta, latitude + latDelta, zoom);
  const bottomRight = lngLatToTile(
    longitude + lngDelta,
    latitude - latDelta,
    zoom,
  );

  const tiles: { x: number; y: number; z: number }[] = [];
  for (let x = topLeft.x; x <= bottomRight.x; x += 1) {
    for (let y = topLeft.y; y <= bottomRight.y; y += 1) {
      tiles.push({ x, y, z: zoom });
    }
  }
  return tiles;
}

type BuildingFeature = {
  kind?: string;
  height?: number;
  min_height?: number;
};

/** Decode one MVT tile into building footprints. */
export function decodeBuildingTile(
  data: ArrayBuffer,
  tile: { x: number; y: number; z: number },
): Building[] {
  const vectorTile = new VectorTile(new PbfReader(new Uint8Array(data)));
  const layer = vectorTile.layers.buildings;
  if (!layer) return [];

  const buildings: Building[] = [];
  const extent = layer.extent;

  for (let i = 0; i < layer.length; i += 1) {
    const feature = layer.feature(i);
    const props = feature.properties as BuildingFeature;

    // Address points share this layer; only whole buildings have polygons.
    if (props.kind === "address") continue;
    if (feature.type !== 3) continue;

    const rings = feature.loadGeometry();
    if (rings.length === 0) continue;

    // Use the outer ring only; shadow projection works on the footprint.
    const outer = rings[0];
    if (outer.length < 3) continue;

    const footprint: LngLat[] = outer.map((point) => {
      const lng =
        ((tile.x + point.x / extent) / 2 ** tile.z) * 360 - 180;
      const latRad = Math.atan(
        Math.sinh(Math.PI * (1 - (2 * (tile.y + point.y / extent)) / 2 ** tile.z)),
      );
      return [lng, (latRad * 180) / Math.PI];
    });

    buildings.push({
      id: i,
      footprint,
      height: props.height ?? DEFAULT_BUILDING_HEIGHT,
      minHeight: props.min_height ?? 0,
      kind: props.kind ?? "building",
    });
  }

  return buildings;
}

/** Load every building within `radius` metres of a point. */
export async function loadBuildings(
  longitude: number,
  latitude: number,
  radiusMetres: number,
): Promise<Building[]> {
  const pm = getArchive();
  const tiles = tilesCoveringRadius(
    longitude,
    latitude,
    radiusMetres,
    BUILDING_ZOOM,
  );

  const results = await Promise.all(
    tiles.map(async (tile) => {
      const data = await pm.getZxy(tile.z, tile.x, tile.y);
      if (!data) return [];
      return decodeBuildingTile(data.data, tile);
    }),
  );

  return results.flat();
}

/** Scene data for a location, using Protomaps buildings and no trees. */
export async function loadScene(
  longitude: number,
  latitude: number,
  radiusMetres: number,
): Promise<SceneData> {
  const buildings = await loadBuildings(longitude, latitude, radiusMetres);
  const trees: Tree[] = [];

  return {
    center: [longitude, latitude],
    radius: radiusMetres,
    buildings,
    trees,
    fetchedAt: new Date().toISOString(),
    source: "protomaps",
  };
}
