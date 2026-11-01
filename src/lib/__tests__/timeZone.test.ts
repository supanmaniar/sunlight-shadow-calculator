import { describe, expect, it } from "vitest";

import { timeZoneAbbreviation, timeZoneFor } from "../timeZone";

describe("timeZoneFor", () => {
  it("resolves major cities to their IANA zone", () => {
    expect(timeZoneFor(51.5007, -0.1246)).toBe("Europe/London");
    expect(timeZoneFor(40.758, -73.9855)).toBe("America/New_York");
    expect(timeZoneFor(-33.8688, 151.2093)).toBe("Australia/Sydney");
    expect(timeZoneFor(35.6762, 139.6503)).toBe("Asia/Tokyo");
    expect(timeZoneFor(48.2082, 16.3738)).toBe("Europe/Vienna");
  });

  it("handles half-hour and quarter-hour offsets", () => {
    expect(timeZoneFor(22.5726, 88.3639)).toBe("Asia/Kolkata");
    expect(timeZoneFor(-43.95, -176.55)).toBe("Pacific/Chatham");
  });

  it("does not return a fixed-offset Etc zone", () => {
    // The old implementation returned Etc/GMT±n, which ignores DST entirely.
    for (const [lat, lng] of [
      [51.5007, -0.1246],
      [40.758, -73.9855],
      [-33.8688, 151.2093],
    ]) {
      expect(timeZoneFor(lat, lng)).not.toMatch(/^Etc\//);
    }
  });

  it("returns a usable zone for open ocean", () => {
    // tz-lookup covers the whole globe, so this resolves to a real zone rather
    // than throwing. The important part is that it never returns an empty
    // string, which would make Intl throw at render time.
    expect(timeZoneFor(0, -160)).toMatch(/^[A-Za-z]+\/[A-Za-z_]+$/);
  });
});

describe("timeZoneAbbreviation", () => {
  it("reports BST for London in summer and GMT in winter", () => {
    const summer = new Date("2026-06-21T12:00:00Z");
    const winter = new Date("2026-12-21T12:00:00Z");
    expect(timeZoneAbbreviation(summer, "Europe/London")).toBe("BST");
    expect(timeZoneAbbreviation(winter, "Europe/London")).toBe("GMT");
  });

  it("reports EDT and EST for New York", () => {
    expect(
      timeZoneAbbreviation(new Date("2026-06-21T12:00:00Z"), "America/New_York"),
    ).toBe("EDT");
    expect(
      timeZoneAbbreviation(new Date("2026-12-21T12:00:00Z"), "America/New_York"),
    ).toBe("EST");
  });
});
