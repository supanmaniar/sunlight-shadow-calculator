import { describe, expect, it } from "vitest";
import {
  dateKeyInZone,
  getSunPosition,
  getSunTimes,
  zonedTimeToUtc,
} from "../sun";

const minutesBetween = (a: Date, b: Date) =>
  Math.abs(a.getTime() - b.getTime()) / 60_000;

describe("getSunTimes", () => {
  it("matches NOAA sunrise/sunset for New York on 2024-06-21", () => {
    const times = getSunTimes(
      new Date("2024-06-21T12:00:00Z"),
      40.7128,
      -74.006,
      "America/New_York",
    );

    // NOAA: sunrise 05:25, sunset 20:31 EDT
    expect(minutesBetween(times.sunrise!, new Date("2024-06-21T09:25:00Z"))).toBeLessThan(3);
    expect(minutesBetween(times.sunset!, new Date("2024-06-22T00:31:00Z"))).toBeLessThan(3);
    expect(times.polarState).toBe("normal");
  });

  it("matches NOAA sunrise/sunset for Sydney on 2024-12-21", () => {
    const times = getSunTimes(
      new Date("2024-12-21T02:00:00Z"),
      -33.8688,
      151.2093,
      "Australia/Sydney",
    );

    // NOAA: sunrise 05:41, sunset 20:05 AEDT
    expect(minutesBetween(times.sunrise!, new Date("2024-12-20T18:41:00Z"))).toBeLessThan(3);
    expect(minutesBetween(times.sunset!, new Date("2024-12-21T09:05:00Z"))).toBeLessThan(3);
  });

  it("reports polar night in Tromsø in December", () => {
    const times = getSunTimes(
      new Date("2024-12-21T12:00:00Z"),
      69.6492,
      18.9553,
      "Europe/Oslo",
    );

    expect(times.sunrise).toBeNull();
    expect(times.sunset).toBeNull();
    expect(times.polarState).toBe("polar-night");
    expect(times.dayLengthMinutes).toBeNull();
  });

  it("reports polar day in Tromsø in June", () => {
    const times = getSunTimes(
      new Date("2024-06-21T12:00:00Z"),
      69.6492,
      18.9553,
      "Europe/Oslo",
    );

    expect(times.polarState).toBe("polar-day");
  });

  it("orders twilight before sunrise and after sunset", () => {
    const times = getSunTimes(
      new Date("2024-03-15T12:00:00Z"),
      51.5072,
      -0.1276,
      "Europe/London",
    );

    expect(times.astronomicalDawn!.getTime()).toBeLessThan(times.nauticalDawn!.getTime());
    expect(times.nauticalDawn!.getTime()).toBeLessThan(times.civilDawn!.getTime());
    expect(times.civilDawn!.getTime()).toBeLessThan(times.sunrise!.getTime());
    expect(times.sunset!.getTime()).toBeLessThan(times.civilDusk!.getTime());
    expect(times.civilDusk!.getTime()).toBeLessThan(times.nauticalDusk!.getTime());
    expect(times.nauticalDusk!.getTime()).toBeLessThan(times.astronomicalDusk!.getTime());
  });

  it("orders blue hour inside the civil twilight window", () => {
    const times = getSunTimes(
      new Date("2024-10-31T12:00:00Z"),
      40.7128,
      -74.006,
      "America/New_York",
    );

    // Morning: civil dawn (-6°) → blue hour ends (-4°) → sunrise.
    expect(times.civilDawn!.getTime()).toBeLessThan(times.blueHourMorningEnd!.getTime());
    expect(times.blueHourMorningEnd!.getTime()).toBeLessThan(times.sunrise!.getTime());

    // Evening: sunset → blue hour starts (-4°) → civil dusk (-6°).
    expect(times.sunset!.getTime()).toBeLessThan(times.blueHourEveningStart!.getTime());
    expect(times.blueHourEveningStart!.getTime()).toBeLessThan(times.civilDusk!.getTime());
  });

  it("returns the solar day matching the local calendar date", () => {
    // 2024-06-22T02:00Z is still 2024-06-21 in New York.
    const times = getSunTimes(
      new Date("2024-06-22T02:00:00Z"),
      40.7128,
      -74.006,
      "America/New_York",
    );

    expect(dateKeyInZone(times.solarNoon, "America/New_York")).toBe("2024-06-21");
  });
});

describe("getSunPosition", () => {
  it("puts the sun near the zenith at local solar noon on the equator", () => {
    const times = getSunTimes(
      new Date("2024-03-20T12:00:00Z"),
      0,
      0,
      "UTC",
    );
    const position = getSunPosition(times.solarNoon, 0, 0);

    expect(position.elevation).toBeGreaterThan(88);
  });

  it("puts the sun below the horizon at local midnight", () => {
    const times = getSunTimes(
      new Date("2024-03-20T12:00:00Z"),
      0,
      0,
      "UTC",
    );
    const midnight = new Date(times.solarNoon.getTime() + 12 * 60 * 60 * 1000);
    const position = getSunPosition(midnight, 0, 0);

    expect(position.elevation).toBeLessThan(-80);
  });

  it("reports a northern azimuth at solar noon in the northern hemisphere", () => {
    const times = getSunTimes(
      new Date("2024-06-21T12:00:00Z"),
      40.7128,
      -74.006,
      "America/New_York",
    );
    const position = getSunPosition(times.solarNoon, 40.7128, -74.006);

    expect(position.azimuth).toBeGreaterThan(150);
    expect(position.azimuth).toBeLessThan(210);
  });
});

describe("zonedTimeToUtc", () => {
  it("converts a wall-clock time in a DST zone", () => {
    const instant = zonedTimeToUtc("2024-07-01", "12:00", "America/New_York");
    expect(instant.toISOString()).toBe("2024-07-01T16:00:00.000Z");
  });

  it("converts a wall-clock time in a standard-time zone", () => {
    const instant = zonedTimeToUtc("2024-01-15", "12:00", "America/New_York");
    expect(instant.toISOString()).toBe("2024-01-15T17:00:00.000Z");
  });
});
