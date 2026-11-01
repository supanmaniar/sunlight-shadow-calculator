import { describe, expect, it } from "vitest";

import { elevationAtPoint, type ElevationGrid } from "../terrain";

function grid(values: number[], size = 2): ElevationGrid {
  return {
    values: new Float32Array(values),
    size,
    west: 0,
    east: 1,
    south: 0,
    north: 1,
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

describe("elevationAtPoint", () => {
  // Row-major, north at the top: [NW, NE, SW, SE]
  const square = grid([100, 200, 300, 400]);

  it("returns the corner values exactly", () => {
    expect(elevationAtPoint(square, 0, 1)).toBeCloseTo(100); // NW
    expect(elevationAtPoint(square, 1, 1)).toBeCloseTo(200); // NE
    expect(elevationAtPoint(square, 0, 0)).toBeCloseTo(300); // SW
    expect(elevationAtPoint(square, 1, 0)).toBeCloseTo(400); // SE
  });

  it("interpolates the centre", () => {
    expect(elevationAtPoint(square, 0.5, 0.5)).toBeCloseTo(250);
  });

  it("clamps coordinates outside the grid", () => {
    expect(elevationAtPoint(square, -5, 5)).toBeCloseTo(100);
    expect(elevationAtPoint(square, 5, -5)).toBeCloseTo(400);
  });

  it("handles a flat grid", () => {
    const flat = grid([42, 42, 42, 42]);
    expect(elevationAtPoint(flat, 0.3, 0.7)).toBeCloseTo(42);
  });
});
