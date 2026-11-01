import { describe, expect, it } from "vitest";

import { buildSunPathRange, monthlyDates } from "../geojson";
import { getSunPosition } from "../../sun";

const LAT = 51.5007;
const LNG = -0.1246;
const positionAt = (date: Date) => getSunPosition(date, LAT, LNG);

describe("monthlyDates", () => {
  it("returns the 21st of every month", () => {
    const dates = monthlyDates(2026);
    expect(dates).toHaveLength(12);
    expect(dates[0]).toBe("2026-01-21");
    expect(dates[11]).toBe("2026-12-21");
  });
});

describe("buildSunPathRange", () => {
  const arcs = buildSunPathRange(LAT, LNG, monthlyDates(2026), positionAt);

  it("returns one arc per date", () => {
    expect(arcs).toHaveLength(12);
    expect(arcs.every((arc) => arc.points.length > 1)).toBe(true);
  });

  it("gives a longer arc in June than in December", () => {
    const june = arcs.find((arc) => arc.date === "2026-06-21")!;
    const december = arcs.find((arc) => arc.date === "2026-12-21")!;
    expect(june.points.length).toBeGreaterThan(december.points.length);
  });

  it("shifts the arc north in summer and south in winter", () => {
    // The northernmost point of the June arc should be further north than the
    // December arc's northernmost point.
    const maxLat = (points: [number, number][]) =>
      Math.max(...points.map(([, lat]) => lat));
    const june = arcs.find((arc) => arc.date === "2026-06-21")!;
    const december = arcs.find((arc) => arc.date === "2026-12-21")!;
    expect(maxLat(june.points)).toBeGreaterThan(maxLat(december.points));
  });

  it("keeps every point near the location", () => {
    for (const arc of arcs) {
      for (const [lng, lat] of arc.points) {
        expect(Math.abs(lat - LAT)).toBeLessThan(0.01);
        expect(Math.abs(lng - LNG)).toBeLessThan(0.01);
      }
    }
  });
});
