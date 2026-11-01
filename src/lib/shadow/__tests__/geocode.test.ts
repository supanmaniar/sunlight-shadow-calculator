import { describe, expect, it } from "vitest";

import { parseCoordinates } from "../geocode";

describe("parseCoordinates", () => {
  it("parses a plain decimal pair", () => {
    expect(parseCoordinates("51.5045, -0.0865")).toMatchObject({
      latitude: 51.5045,
      longitude: -0.0865,
    });
  });

  it("parses without a space after the comma", () => {
    expect(parseCoordinates("51.5045,-0.0865")).toMatchObject({
      latitude: 51.5045,
      longitude: -0.0865,
    });
  });

  it("parses a space-separated pair", () => {
    expect(parseCoordinates("51.5045 -0.0865")).toMatchObject({
      latitude: 51.5045,
      longitude: -0.0865,
    });
  });

  it("parses a geo: URI", () => {
    expect(parseCoordinates("geo:51.5045,-0.0865")).toMatchObject({
      latitude: 51.5045,
      longitude: -0.0865,
    });
  });

  it("swaps a reversed lng,lat pair", () => {
    // 151.2 cannot be a latitude, so the order must be flipped.
    expect(parseCoordinates("151.2, -33.87")).toMatchObject({
      latitude: -33.87,
      longitude: 151.2,
    });
  });

  it("keeps the given order when both values are valid latitudes", () => {
    // Ambiguous input: -0.0865 is a legal latitude, so it is not swapped.
    expect(parseCoordinates("-0.0865, 51.5045")).toMatchObject({
      latitude: -0.0865,
      longitude: 51.5045,
    });
  });

  it("parses degrees/minutes/seconds with hemispheres", () => {
    const result = parseCoordinates(`51°30'16.2"N 0°05'11.4"W`);
    expect(result).not.toBeNull();
    expect(result!.latitude).toBeCloseTo(51.5045, 3);
    expect(result!.longitude).toBeCloseTo(-0.0865, 3);
  });

  it("applies the southern and western signs", () => {
    const result = parseCoordinates(`33°52'0"S 151°12'0"E`);
    expect(result!.latitude).toBeCloseTo(-33.8667, 3);
    expect(result!.longitude).toBeCloseTo(151.2, 3);
  });

  it("labels the result as coordinates", () => {
    expect(parseCoordinates("51.5045, -0.0865")?.detail).toBe("Coordinates");
  });

  it("rejects out-of-range values", () => {
    expect(parseCoordinates("200, 300")).toBeNull();
  });

  it("rejects ordinary place names", () => {
    expect(parseCoordinates("Trafalgar Square")).toBeNull();
    expect(parseCoordinates("London")).toBeNull();
    expect(parseCoordinates("")).toBeNull();
  });

  it("rejects a single number", () => {
    expect(parseCoordinates("51.5045")).toBeNull();
  });
});
