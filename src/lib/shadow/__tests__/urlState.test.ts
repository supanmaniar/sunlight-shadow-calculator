import { describe, expect, it } from "vitest";

import { DEFAULT_STATE, parseState, serializeState } from "../urlState";

const TODAY = "2026-06-21";

function parse(query: string) {
  return parseState(new URLSearchParams(query), TODAY);
}

describe("parseState", () => {
  it("returns defaults for an empty query string", () => {
    const state = parse("");
    expect(state.lat).toBe(DEFAULT_STATE.lat);
    expect(state.lng).toBe(DEFAULT_STATE.lng);
    expect(state.date).toBe(TODAY);
    expect(state.time).toBe(DEFAULT_STATE.time);
    expect(state.radius).toBe(DEFAULT_STATE.radius);
  });

  it("reads a full query string", () => {
    const state = parse("lat=51.5045&lng=-0.0865&z=16&p=60&b=-20&d=2026-12-01&t=18:30&fov=55&r=600");
    expect(state).toMatchObject({
      lat: 51.5045,
      lng: -0.0865,
      zoom: 16,
      pitch: 60,
      bearing: -20,
      date: "2026-12-01",
      time: "18:30",
      fov: 55,
      radius: 600,
    });
  });

  it("clamps coordinates and camera values into range", () => {
    const state = parse("lat=999&lng=-999&z=99&p=-40&fov=5&r=99999");
    expect(state.lat).toBe(85);
    expect(state.lng).toBe(-180);
    expect(state.zoom).toBe(20);
    expect(state.pitch).toBe(0);
    expect(state.fov).toBe(20);
    expect(state.radius).toBe(2000);
  });

  it("falls back to defaults for non-numeric numbers", () => {
    const state = parse("lat=abc&lng=&z=NaN&r=Infinity");
    expect(state.lat).toBe(DEFAULT_STATE.lat);
    expect(state.lng).toBe(DEFAULT_STATE.lng);
    expect(state.zoom).toBe(DEFAULT_STATE.zoom);
    expect(state.radius).toBe(DEFAULT_STATE.radius);
  });

  describe("date validation", () => {
    it("accepts a real calendar date", () => {
      expect(parse("d=2024-02-29").date).toBe("2024-02-29");
    });

    it("rejects a date that does not exist", () => {
      expect(parse("d=2023-02-29").date).toBe(TODAY);
      expect(parse("d=2026-13-01").date).toBe(TODAY);
      expect(parse("d=2026-04-31").date).toBe(TODAY);
    });

    it("rejects malformed dates", () => {
      expect(parse("d=").date).toBe(TODAY);
      expect(parse("d=today").date).toBe(TODAY);
      expect(parse("d=2026-6-1").date).toBe(TODAY);
      expect(parse("d=2026-06-21T00:00:00Z").date).toBe(TODAY);
    });
  });

  describe("time validation", () => {
    it("accepts a valid wall-clock time", () => {
      expect(parse("t=00:00").time).toBe("00:00");
      expect(parse("t=23:59").time).toBe("23:59");
    });

    it("rejects decimal hours, which would otherwise produce an Invalid Date", () => {
      expect(parse("t=18.5").time).toBe(DEFAULT_STATE.time);
    });

    it("rejects out-of-range and malformed times", () => {
      expect(parse("t=24:00").time).toBe(DEFAULT_STATE.time);
      expect(parse("t=12:60").time).toBe(DEFAULT_STATE.time);
      expect(parse("t=1200").time).toBe(DEFAULT_STATE.time);
      expect(parse("t=").time).toBe(DEFAULT_STATE.time);
    });
  });
});

describe("serializeState", () => {
  it("round-trips through parseState", () => {
    const state = {
      lat: 51.5045,
      lng: -0.0865,
      zoom: 16.2,
      pitch: 60,
      bearing: -20,
      date: "2026-06-21",
      time: "18:30",
      fov: 60,
      radius: 600,
    };
    expect(parse(serializeState(state))).toEqual(state);
  });

  it("always emits a parseable date and time", () => {
    const query = serializeState({ ...DEFAULT_STATE, date: TODAY });
    const state = parse(query);
    expect(state.date).toBe(TODAY);
    expect(state.time).toBe(DEFAULT_STATE.time);
  });
});

describe("camera orientation", () => {
  it("round-trips bearing and pitch through the URL", () => {
    const state = { ...DEFAULT_STATE, date: TODAY, bearing: 151, pitch: 20 };
    const parsed = parse(serializeState(state));
    expect(parsed.bearing).toBe(151);
    expect(parsed.pitch).toBe(20);
  });

  it("keeps a negative bearing", () => {
    expect(parse("b=-20").bearing).toBe(-20);
  });

  it("keeps a bearing beyond a full turn", () => {
    // MapLibre normalises internally; the URL must not silently clamp it.
    expect(parse("b=540").bearing).toBe(540);
  });

  it("clamps pitch to the range the map supports", () => {
    expect(parse("p=120").pitch).toBe(85);
    expect(parse("p=-10").pitch).toBe(0);
  });
});
