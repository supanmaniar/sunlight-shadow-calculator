import { describe, expect, it } from "vitest";

import {
  darknessFor,
  lightPhaseFor,
  mixHex,
  tintFor,
  warmthFor,
} from "../lightPhase";

describe("lightPhaseFor", () => {
  it("classifies each band by elevation", () => {
    expect(lightPhaseFor(45).phase).toBe("day");
    expect(lightPhaseFor(6).phase).toBe("day");
    expect(lightPhaseFor(5.9).phase).toBe("golden");
    expect(lightPhaseFor(0).phase).toBe("golden");
    expect(lightPhaseFor(-0.833).phase).toBe("golden");
    expect(lightPhaseFor(-1).phase).toBe("civil");
    expect(lightPhaseFor(-3.9).phase).toBe("civil");
    expect(lightPhaseFor(-4).phase).toBe("blue");
    expect(lightPhaseFor(-5.9).phase).toBe("blue");
    expect(lightPhaseFor(-6).phase).toBe("nautical");
    expect(lightPhaseFor(-12).phase).toBe("astronomical");
    expect(lightPhaseFor(-18).phase).toBe("night");
    expect(lightPhaseFor(-40).phase).toBe("night");
  });

  it("reports whether the sun is up", () => {
    expect(lightPhaseFor(10).sunUp).toBe(true);
    expect(lightPhaseFor(1).sunUp).toBe(true);
    expect(lightPhaseFor(-1).sunUp).toBe(false);
    expect(lightPhaseFor(-30).sunUp).toBe(false);
  });

  it("gives every phase a distinct label", () => {
    const labels = [45, 3, -2, -5, -9, -15, -30].map(
      (e) => lightPhaseFor(e).label,
    );
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("darknessFor", () => {
  it("is zero in full daylight and one at night", () => {
    expect(darknessFor(30)).toBe(0);
    expect(darknessFor(6)).toBe(0);
    expect(darknessFor(-18)).toBe(1);
    expect(darknessFor(-40)).toBe(1);
  });

  it("increases monotonically as the sun sets", () => {
    const values = [10, 4, 0, -3, -6, -10, -14, -18].map(darknessFor);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });

  it("stays within 0..1", () => {
    for (let e = -90; e <= 90; e += 1) {
      const d = darknessFor(e);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(1);
    }
  });
});

describe("warmthFor", () => {
  it("is neutral high in the sky and full at the horizon", () => {
    expect(warmthFor(40)).toBe(0);
    expect(warmthFor(20)).toBe(0);
    expect(warmthFor(0)).toBe(1);
  });

  it("fades out once the sun is below the horizon", () => {
    expect(warmthFor(-3)).toBeCloseTo(0.5);
    expect(warmthFor(-6)).toBe(0);
    expect(warmthFor(-30)).toBe(0);
  });

  it("ramps between", () => {
    expect(warmthFor(10)).toBeCloseTo(0.5);
  });
});

describe("mixHex", () => {
  it("returns the endpoints unchanged", () => {
    expect(mixHex("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mixHex("#000000", "#ffffff", 1)).toBe("#ffffff");
  });

  it("blends channel-wise", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixHex("#ff0000", "#0000ff", 0.5)).toBe("#800080");
  });
});

describe("tintFor", () => {
  it("is clear in full daylight", () => {
    expect(tintFor(45).opacity).toBe(0);
    expect(tintFor(20).opacity).toBe(0);
  });

  it("gets progressively stronger as the sun sets", () => {
    const values = [10, 3, -2, -5, -9, -15, -25].map((e) => tintFor(e).opacity);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });

  it("stays within 0..1 and returns a valid hex colour", () => {
    for (let e = -90; e <= 90; e += 1) {
      const { color, opacity } = tintFor(e);
      expect(opacity).toBeGreaterThanOrEqual(0);
      expect(opacity).toBeLessThanOrEqual(1);
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("is blue at blue hour and near-black at night", () => {
    const blue = tintFor(-5).color;
    const night = tintFor(-30).color;
    const channels = (hex: string) =>
      [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const [br, bg, bb] = channels(blue);
    expect(bb).toBeGreaterThan(br);
    expect(bb).toBeGreaterThan(bg);
    const [nr, ng, nb] = channels(night);
    expect(Math.max(nr, ng, nb)).toBeLessThan(40);
  });
});
