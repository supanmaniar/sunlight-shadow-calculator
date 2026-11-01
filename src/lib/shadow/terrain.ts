/**
 * Terrain elevation from the AWS Open Data "Terrain Tiles" dataset.
 *
 * Tiles are Terrarium-encoded PNGs: elevation in metres is
 * `(R * 256 + G + B / 256) - 32768`. The bucket is public, needs no key, and
 * sends `Access-Control-Allow-Origin: *`, so it can be read from the browser.
 *
 * Source: https://registry.opendata.aws/terrain-tiles/
 */

import { PNG } from "pngjs";

const TERRARIUM_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium";
const TILE_SIZE = 256;

/** Zoom 12 gives ~38 m per pixel at the equator — enough for hills and valleys. */
export const TERRAIN_ZOOM = 12;

export type ElevationGrid = {
  /** Elevation in metres, row-major, `size * size` entries. */
  values: Float32Array;
  size: number;
  /** Bounding box of the sampled area. */
  west: number;
  south: number;
  east: number;
  north: number;
  /** Lowest and highest elevation found, in metres. */
  min: number;
  max: number;
};

function lngLatToTilePixel(
  longitude: number,
  latitude: number,
  zoom: number,
): { x: number; y: number } {
  const n = 2 ** zoom;
  const latRad = (latitude * Math.PI) / 180;
  return {
    x: ((longitude + 180) / 360) * n * TILE_SIZE,
    y:
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      n *
      TILE_SIZE,
  };
}

type TilePixels = { data: Uint8Array; channels: number };

async function loadTile(
  z: number,
  x: number,
  y: number,
  signal?: AbortSignal,
): Promise<TilePixels | null> {
  const url = `${TERRARIUM_URL}/${z}/${x}/${y}.png`;
  const response = await fetch(url, { signal });
  if (!response.ok) return null;

  // Decoded with pngjs rather than a canvas: this runs in a Node serverless
  // function, where createImageBitmap and document do not exist.
  const buffer = Buffer.from(await response.arrayBuffer());
  const png = PNG.sync.read(buffer);
  return { data: new Uint8Array(png.data), channels: png.data.length / (png.width * png.height) };
}

function elevationAt(tile: TilePixels, x: number, y: number): number {
  const index = (y * TILE_SIZE + x) * tile.channels;
  const r = tile.data[index];
  const g = tile.data[index + 1];
  const b = tile.data[index + 2];
  return r * 256 + g + b / 256 - 32768;
}

/**
 * Sample a square elevation grid covering `radiusMetres` around a point.
 *
 * Returns `null` when the tiles cannot be fetched, so callers can fall back to
 * flat ground rather than failing the whole scene.
 */
export async function loadElevationGrid(
  longitude: number,
  latitude: number,
  radiusMetres: number,
  size = 32,
  signal?: AbortSignal,
): Promise<ElevationGrid | null> {
  const latDelta = radiusMetres / 111_320;
  const lngDelta =
    radiusMetres / (111_320 * Math.cos((latitude * Math.PI) / 180));

  const west = longitude - lngDelta;
  const east = longitude + lngDelta;
  const south = latitude - latDelta;
  const north = latitude + latDelta;

  const topLeft = lngLatToTilePixel(west, north, TERRAIN_ZOOM);
  const bottomRight = lngLatToTilePixel(east, south, TERRAIN_ZOOM);

  const minTileX = Math.floor(topLeft.x / TILE_SIZE);
  const maxTileX = Math.floor(bottomRight.x / TILE_SIZE);
  const minTileY = Math.floor(topLeft.y / TILE_SIZE);
  const maxTileY = Math.floor(bottomRight.y / TILE_SIZE);

  // Guard against a pathological radius producing hundreds of tiles.
  if ((maxTileX - minTileX + 1) * (maxTileY - minTileY + 1) > 64) return null;

  const tiles = new Map<string, TilePixels | null>();
  const requests: Promise<void>[] = [];
  for (let tx = minTileX; tx <= maxTileX; tx += 1) {
    for (let ty = minTileY; ty <= maxTileY; ty += 1) {
      requests.push(
        loadTile(TERRAIN_ZOOM, tx, ty, signal)
          .then((image) => {
            tiles.set(`${tx},${ty}`, image);
          })
          .catch(() => {
            tiles.set(`${tx},${ty}`, null);
          }),
      );
    }
  }
  await Promise.all(requests);

  const values = new Float32Array(size * size);
  let min = Infinity;
  let max = -Infinity;
  let sampled = 0;

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      const lng = west + ((east - west) * column) / (size - 1);
      const lat = north - ((north - south) * row) / (size - 1);
      const pixel = lngLatToTilePixel(lng, lat, TERRAIN_ZOOM);
      const tx = Math.floor(pixel.x / TILE_SIZE);
      const ty = Math.floor(pixel.y / TILE_SIZE);
      const image = tiles.get(`${tx},${ty}`);
      if (!image) continue;

      const px = Math.min(TILE_SIZE - 1, Math.max(0, Math.round(pixel.x - tx * TILE_SIZE)));
      const py = Math.min(TILE_SIZE - 1, Math.max(0, Math.round(pixel.y - ty * TILE_SIZE)));
      const elevation = elevationAt(image, px, py);
      values[row * size + column] = elevation;
      if (elevation < min) min = elevation;
      if (elevation > max) max = elevation;
      sampled += 1;
    }
  }

  if (sampled === 0) return null;

  return { values, size, west, south, east, north, min, max };
}

/** Bilinear sample of the grid at a coordinate, clamped to the edges. */
export function elevationAtPoint(
  grid: ElevationGrid,
  longitude: number,
  latitude: number,
): number {
  const { size, west, east, north, south, values } = grid;
  const fx = ((longitude - west) / (east - west)) * (size - 1);
  const fy = ((north - latitude) / (north - south)) * (size - 1);

  const x0 = Math.min(size - 1, Math.max(0, Math.floor(fx)));
  const y0 = Math.min(size - 1, Math.max(0, Math.floor(fy)));
  const x1 = Math.min(size - 1, x0 + 1);
  const y1 = Math.min(size - 1, y0 + 1);
  const tx = Math.min(1, Math.max(0, fx - x0));
  const ty = Math.min(1, Math.max(0, fy - y0));

  const top = values[y0 * size + x0] * (1 - tx) + values[y0 * size + x1] * tx;
  const bottom = values[y1 * size + x0] * (1 - tx) + values[y1 * size + x1] * tx;
  return top * (1 - ty) + bottom * ty;
}
