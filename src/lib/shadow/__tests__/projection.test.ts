import { describe, expect, it } from "vitest";
import {
  buildingShadow,
  convexHull,
  metresPerDegreeLng,
  offsetToLngLat,
  polygonArea,
  shadowOffset,
  treeShadow,
  type LngLat,
} from "../projection";

describe("shadowOffset", () => {
  it("casts a shadow northward when the sun is due south", () => {
    const { east, north } = shadowOffset(10, 180, 45);
    expect(east).toBeCloseTo(0, 6);
    expect(north).toBeCloseTo(10, 6);
  });

  it("casts a shadow eastward when the sun is due west", () => {
    const { east, north } = shadowOffset(10, 270, 45);
    expect(east).toBeCloseTo(10, 6);
    expect(north).toBeCloseTo(0, 6);
  });

  it("lengthens the shadow as the sun gets lower", () => {
    const high = shadowOffset(10, 180, 60);
    const low = shadowOffset(10, 180, 15);
    expect(low.north).toBeGreaterThan(high.north);
  });

  it("returns no offset when the sun is at or below the horizon", () => {
    expect(shadowOffset(10, 180, 0)).toEqual({ east: 0, north: 0 });
    expect(shadowOffset(10, 180, -5)).toEqual({ east: 0, north: 0 });
  });
});

describe("offsetToLngLat", () => {
  it("moves north by the expected latitude delta", () => {
    const [, lat] = offsetToLngLat([0, 0], 0, 111_320);
    expect(lat).toBeCloseTo(1, 6);
  });

  it("accounts for longitude convergence at high latitude", () => {
    const equator = metresPerDegreeLng(0);
    const highLat = metresPerDegreeLng(60);
    expect(highLat).toBeCloseTo(equator / 2, 0);
  });
});

describe("convexHull", () => {
  it("drops interior points", () => {
    const square: LngLat[] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0.5, 0.5],
    ];
    expect(convexHull(square)).toHaveLength(4);
  });

  it("returns the input for degenerate shapes", () => {
    expect(convexHull([[0, 0], [1, 1]])).toHaveLength(2);
  });
});

describe("buildingShadow", () => {
  const square: LngLat[] = [
    [0, 0],
    [0.0001, 0],
    [0.0001, 0.0001],
    [0, 0.0001],
  ];

  it("returns null when the sun is below the horizon", () => {
    expect(buildingShadow(square, 20, 180, -1)).toBeNull();
  });

  it("returns null for a zero-height building", () => {
    expect(buildingShadow(square, 0, 180, 45)).toBeNull();
  });

  it("produces a polygon larger than the footprint", () => {
    const shadow = buildingShadow(square, 20, 180, 30);
    expect(shadow).not.toBeNull();
    expect(polygonArea(shadow!)).toBeGreaterThan(polygonArea(square));
  });

  it("extends the shadow away from the sun", () => {
    // Sun due south (180°) → shadow extends north (higher latitude).
    const shadow = buildingShadow(square, 20, 180, 30)!;
    const maxLat = Math.max(...shadow.map((p) => p[1]));
    expect(maxLat).toBeGreaterThan(0.0001);
  });
});

describe("treeShadow", () => {
  it("returns null when the sun is below the horizon", () => {
    expect(treeShadow([0, 0], 3, 5, 180, 0)).toBeNull();
  });

  it("produces a closed ring of the requested segment count", () => {
    const shadow = treeShadow([0, 0], 3, 5, 180, 45, 12);
    expect(shadow).toHaveLength(12);
  });

  it("offsets the crown away from the sun", () => {
    const shadow = treeShadow([0, 0], 3, 10, 180, 45)!;
    const centroidLat =
      shadow.reduce((sum, p) => sum + p[1], 0) / shadow.length;
    expect(centroidLat).toBeGreaterThan(0);
  });
});
