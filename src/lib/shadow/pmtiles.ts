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

/**
 * Land-cover kinds that represent tree canopy. Protomaps has no individual tree
 * layer, but these polygons are real OSM vegetation areas, and unlike Overpass
 * they arrive in the same request as the buildings — no rate limit, no timeout.
 */
const CANOPY_KINDS = new Set(["wood", "scrub", "forest", "orchard"]);

/** Average canopy height per kind, in metres. */
const CANOPY_HEIGHT: Record<string, number> = {
  wood: 14,
  forest: 16,
  scrub: 3,
  orchard: 5,
};

/** Decode one MVT tile into tree-canopy areas, sampled as individual crowns. */
export function decodeCanopyTile(
  data: ArrayBuffer,
  tile: { x: number; y: number; z: number },
): Tree[] {
  const vectorTile = new VectorTile(new PbfReader(new Uint8Array(data)));
  const layer = vectorTile.layers.landuse;
  if (!layer) return [];

  const trees: Tree[] = [];
  const extent = layer.extent;
  let nextId = 0;

  const toLngLat = (point: { x: number; y: number }): LngLat => {
    const lng = ((tile.x + point.x / extent) / 2 ** tile.z) * 360 - 180;
    const latRad = Math.atan(
      Math.sinh(Math.PI * (1 - (2 * (tile.y + point.y / extent)) / 2 ** tile.z)),
    );
    return [lng, (latRad * 180) / Math.PI];
  };

  for (let i = 0; i < layer.length; i += 1) {
    const feature = layer.feature(i);
    const props = feature.properties as { kind?: string };
    if (!props.kind || !CANOPY_KINDS.has(props.kind)) continue;
    if (feature.type !== 3) continue;

    const rings = feature.loadGeometry();
    if (rings.length === 0) continue;
    const outer = rings[0];
    if (outer.length < 3) continue;

    const polygon = outer.map(toLngLat);

    // Sample crowns on a grid inside the polygon's bounding box. A canopy area
    // is modelled as a cluster of trees rather than one giant blob, so the
    // shadow it casts has texture instead of a single hard edge.
    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    for (const [lng, lat] of polygon) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }

    const height = CANOPY_HEIGHT[props.kind] ?? 10;
    const crownRadius = Math.max(2, height * 0.35);
    const metresPerDegLat = 111_320;
    const metresPerDegLng = 111_320 * Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
    const widthM = (maxLng - minLng) * metresPerDegLng;
    const heightM = (maxLat - minLat) * metresPerDegLat;

    // One crown per ~12 m cell, capped so a huge wood does not explode the scene.
    const stepM = 12;
    const columns = Math.max(1, Math.min(14, Math.round(widthM / stepM)));
    const rows = Math.max(1, Math.min(14, Math.round(heightM / stepM)));

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const lng = minLng + ((maxLng - minLng) * (column + 0.5)) / columns;
        const lat = minLat + ((maxLat - minLat) * (row + 0.5)) / rows;
        if (!pointInPolygon(lng, lat, polygon)) continue;
        trees.push({
          id: nextId++,
          center: [lng, lat],
          height,
          crownRadius,
        });
      }
    }
  }

  return trees;
}

/** Ray-casting point-in-polygon test. */
function pointInPolygon(lng: number, lat: number, polygon: LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

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

/** Load tree-canopy areas within `radius` metres of a point. */
export async function loadCanopy(
  longitude: number,
  latitude: number,
  radiusMetres: number,
): Promise<Tree[]> {
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
      return decodeCanopyTile(data.data, tile);
    }),
  );

  return results.flat();
}

/** Scene data for a location: Protomaps buildings plus tree canopy. */
export async function loadScene(
  longitude: number,
  latitude: number,
  radiusMetres: number,
): Promise<SceneData> {
  const [buildings, trees] = await Promise.all([
    loadBuildings(longitude, latitude, radiusMetres),
    loadCanopy(longitude, latitude, radiusMetres),
  ]);

  return {
    center: [longitude, latitude],
    radius: radiusMetres,
    buildings,
    trees,
    fetchedAt: new Date().toISOString(),
    source: "protomaps",
  };
}
