import { describe, expect, it } from "vitest";
import { lngLatToTile, tilesCoveringRadius } from "../pmtiles";

describe("lngLatToTile", () => {
  it("maps the null island to the centre of the world at z0", () => {
    expect(lngLatToTile(0, 0, 0)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("maps London to the expected z15 tile", () => {
    // Trafalgar Square.
    expect(lngLatToTile(-0.1246, 51.5007, 15)).toEqual({
      x: 16372,
      y: 10897,
      z: 15,
    });
  });

  it("increases y toward the south", () => {
    const north = lngLatToTile(0, 51, 15);
    const south = lngLatToTile(0, 50, 15);
    expect(south.y).toBeGreaterThan(north.y);
  });

  it("increases x toward the east", () => {
    const west = lngLatToTile(-1, 51, 15);
    const east = lngLatToTile(0, 51, 15);
    expect(east.x).toBeGreaterThan(west.x);
  });
});

describe("tilesCoveringRadius", () => {
  it("returns at least one tile", () => {
    expect(tilesCoveringRadius(-0.1246, 51.5007, 250, 15).length).toBeGreaterThan(0);
  });

  it("covers more tiles for a larger radius", () => {
    const small = tilesCoveringRadius(-0.1246, 51.5007, 100, 15).length;
    const large = tilesCoveringRadius(-0.1246, 51.5007, 600, 15).length;
    expect(large).toBeGreaterThanOrEqual(small);
  });

  it("returns unique tiles", () => {
    const tiles = tilesCoveringRadius(-0.1246, 51.5007, 400, 15);
    const keys = new Set(tiles.map((t) => `${t.z}/${t.x}/${t.y}`));
    expect(keys.size).toBe(tiles.length);
  });
});
