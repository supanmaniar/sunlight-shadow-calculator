import { describe, expect, it } from "vitest";

import { decodeCanopyTile } from "../pmtiles";

import { PbfWriter } from "pbf";

/**
 * Build a minimal MVT tile containing one landuse polygon, using the real
 * protobuf writer so the encoding is guaranteed valid.
 */
function buildTile(kind: string, ring: [number, number][]): ArrayBuffer {
  const extent = 4096;

  // Geometry commands: MoveTo(1), LineTo(2) for the rest, ClosePath(7).
  const commands: number[] = [];
  const push = (cmd: number, count: number) => commands.push((count << 3) | cmd);
  push(1, 1);
  commands.push(ring[0][0], ring[0][1]);
  push(2, ring.length - 1);
  for (let i = 1; i < ring.length; i += 1) commands.push(ring[i][0], ring[i][1]);
  push(7, 1);

  const feature = new PbfWriter();
  feature.writeVarintField(1, 1); // id
  feature.writePackedVarint(2, [0, 0]); // tags -> key/value index pairs
  feature.writeVarintField(3, 3); // type: polygon
  feature.writePackedVarint(4, commands); // geometry
  const featureBytes = feature.finish();

  // A Value message wraps the string: field 1 (string_value) = kind.
  const value = new PbfWriter();
  value.writeStringField(1, kind);
  const valueBytes = value.finish();

  const layer = new PbfWriter();
  layer.writeStringField(1, "landuse");
  layer.writeBytesField(2, featureBytes);
  layer.writeStringField(3, "kind");
  layer.writeBytesField(4, valueBytes);
  layer.writeVarintField(5, extent);
  layer.writeVarintField(15, 2);
  const layerBytes = layer.finish();

  const tile = new PbfWriter();
  tile.writeBytesField(3, layerBytes);
  return tile.finish().buffer as ArrayBuffer;
}

const square: [number, number][] = [
  [0, 0],
  [4096, 0],
  [4096, 4096],
  [0, 4096],
];

describe("decodeCanopyTile", () => {
  it("produces crowns for a wood polygon", () => {
    const trees = decodeCanopyTile(buildTile("wood", square), { x: 16372, y: 10897, z: 15 });
    expect(trees.length).toBeGreaterThan(0);
    expect(trees[0].height).toBe(14);
    expect(trees[0].crownRadius).toBeGreaterThan(0);
  });

  it("ignores land cover that is not canopy", () => {
    for (const kind of ["grass", "pitch", "residential", "park", "water"]) {
      expect(decodeCanopyTile(buildTile(kind, square), { x: 1, y: 1, z: 15 })).toHaveLength(0);
    }
  });

  it("places every crown inside the tile's geographic bounds", () => {
    const tile = { x: 16372, y: 10897, z: 15 };
    const trees = decodeCanopyTile(buildTile("wood", square), tile);
    const n = 2 ** tile.z;
    const west = (tile.x / n) * 360 - 180;
    const east = ((tile.x + 1) / n) * 360 - 180;
    for (const tree of trees) {
      expect(tree.center[0]).toBeGreaterThanOrEqual(west - 1e-6);
      expect(tree.center[0]).toBeLessThanOrEqual(east + 1e-6);
    }
  });

  it("caps the number of crowns for a very large area", () => {
    const trees = decodeCanopyTile(buildTile("wood", square), { x: 1, y: 1, z: 15 });
    expect(trees.length).toBeLessThanOrEqual(14 * 14);
  });
});
