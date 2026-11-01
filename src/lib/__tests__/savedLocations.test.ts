import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_STATE } from "../shadow/urlState";

// Minimal localStorage so the module can be tested in Node.
const store = new Map<string, string>();
vi.stubGlobal("window", {
  localStorage: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  },
});

const { deleteLocation, loadSaved, saveLocation } = await import("../savedLocations");

const state = { ...DEFAULT_STATE, date: "2026-06-21", lat: 51.5045, lng: -0.0865 };

beforeEach(() => store.clear());

describe("saved locations", () => {
  it("starts empty", () => {
    expect(loadSaved()).toEqual([]);
  });

  it("saves and reloads a location with its full state", () => {
    const { ok, locations } = saveLocation("The Shard", state);
    expect(ok).toBe(true);
    expect(locations).toHaveLength(1);
    expect(locations[0].name).toBe("The Shard");
    expect(locations[0].state.lat).toBe(51.5045);
    expect(loadSaved()[0].name).toBe("The Shard");
  });

  it("puts the newest location first", () => {
    saveLocation("First", state);
    saveLocation("Second", state);
    expect(loadSaved().map((l) => l.name)).toEqual(["Second", "First"]);
  });

  it("falls back to a default name when blank", () => {
    const { locations } = saveLocation("   ", state);
    expect(locations[0].name).toBe("Untitled location");
  });

  it("deletes by id", () => {
    const { locations } = saveLocation("Keep", state);
    saveLocation("Remove", state);
    const after = deleteLocation(loadSaved()[0].id);
    expect(after.map((l) => l.name)).toEqual(["Keep"]);
    expect(locations).toHaveLength(1);
  });

  it("ignores corrupt stored data instead of throwing", () => {
    store.set("suncalc.savedLocations.v1", "{not json");
    expect(loadSaved()).toEqual([]);
  });

  it("drops entries that are missing required fields", () => {
    store.set(
      "suncalc.savedLocations.v1",
      JSON.stringify([{ id: "a", name: "ok", state, savedAt: "x" }, { id: "b" }, null]),
    );
    expect(loadSaved()).toHaveLength(1);
  });

  it("reports failure when storage throws", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => null,
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
      },
    });
    const { ok } = saveLocation("Nope", state);
    expect(ok).toBe(false);
  });
});
