import { describe, expect, it } from "vitest";
import {
  buildOverpassQuery,
  inferBuildingHeight,
  inferTreeSize,
  parseOverpassResponse,
} from "../osm";

describe("inferBuildingHeight", () => {
  it("prefers an explicit height tag", () => {
    expect(
      inferBuildingHeight({ height: "34.5", "building:levels": "8" }),
    ).toBe(34.5);
  });

  it("parses heights with units", () => {
    expect(inferBuildingHeight({ height: "12 m" })).toBe(12);
  });

  it("falls back to levels plus roof levels", () => {
    expect(
      inferBuildingHeight({ "building:levels": "5", "roof:levels": "1" }),
    ).toBeCloseTo(19.2, 5);
  });

  it("uses a default when no height data exists", () => {
    expect(inferBuildingHeight({ building: "yes" })).toBe(8);
  });
});

describe("inferTreeSize", () => {
  it("derives crown radius from diameter_crown", () => {
    expect(inferTreeSize({ height: "10", diameter_crown: "6" })).toEqual({
      height: 10,
      crownRadius: 3,
    });
  });

  it("derives crown radius from circumference", () => {
    const { crownRadius } = inferTreeSize({ circumference: "3.14" });
    expect(crownRadius).toBeCloseTo(0.5, 2);
  });

  it("uses defaults when tags are missing", () => {
    expect(inferTreeSize({})).toEqual({ height: 8, crownRadius: 2.5 });
  });
});

describe("buildOverpassQuery", () => {
  it("includes both buildings and trees around the point", () => {
    const query = buildOverpassQuery(48.2, 16.37, 250);
    expect(query).toContain('way["building"]');
    expect(query).toContain('node["natural"="tree"]');
    expect(query).toContain("(around:250,48.2,16.37)");
  });
});

describe("parseOverpassResponse", () => {
  it("converts ways to lon/lat footprints and nodes to trees", () => {
    const payload = {
      elements: [
        {
          type: "way",
          id: 1,
          tags: { building: "apartments", height: "20" },
          geometry: [
            { lat: 48.0, lon: 16.0 },
            { lat: 48.0, lon: 16.001 },
            { lat: 48.001, lon: 16.001 },
          ],
        },
        {
          type: "node",
          id: 2,
          lat: 48.0005,
          lon: 16.0005,
          tags: { natural: "tree", height: "12", diameter_crown: "8" },
        },
      ],
    };

    const { buildings, trees } = parseOverpassResponse(payload);

    expect(buildings).toHaveLength(1);
    expect(buildings[0].height).toBe(20);
    expect(buildings[0].footprint[0]).toEqual([16.0, 48.0]);

    expect(trees).toHaveLength(1);
    expect(trees[0].center).toEqual([16.0005, 48.0005]);
    expect(trees[0].crownRadius).toBe(4);
  });

  it("skips degenerate footprints", () => {
    const payload = {
      elements: [
        {
          type: "way",
          id: 3,
          tags: { building: "yes" },
          geometry: [
            { lat: 48.0, lon: 16.0 },
            { lat: 48.0, lon: 16.001 },
          ],
        },
      ],
    };
    expect(parseOverpassResponse(payload).buildings).toHaveLength(0);
  });

  it("tolerates an empty response", () => {
    expect(parseOverpassResponse({})).toEqual({ buildings: [], trees: [] });
  });
});
