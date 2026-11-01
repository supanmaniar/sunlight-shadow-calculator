import type { MapState } from "./shadow/urlState";

export type SavedLocation = {
  id: string;
  name: string;
  /** Full camera + time state, so reopening restores the exact view. */
  state: MapState;
  savedAt: string;
};

const STORAGE_KEY = "suncalc.savedLocations.v1";
const MAX_SAVED = 50;

/**
 * Saved locations live in localStorage: no account, no server, nothing to
 * expire. Every read is defensive because storage can be unavailable (private
 * mode, disabled cookies) or hold data written by an older version.
 */
export function loadSaved(): SavedLocation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSavedLocation).slice(0, MAX_SAVED);
  } catch {
    return [];
  }
}

function isSavedLocation(value: unknown): value is SavedLocation {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<SavedLocation>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.savedAt === "string" &&
    typeof candidate.state === "object" &&
    candidate.state !== null &&
    typeof candidate.state.lat === "number" &&
    typeof candidate.state.lng === "number"
  );
}

function persist(locations: SavedLocation[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(locations));
    return true;
  } catch {
    // Quota exceeded or storage blocked. The caller surfaces this to the user.
    return false;
  }
}

export function saveLocation(
  name: string,
  state: MapState,
): { ok: boolean; locations: SavedLocation[] } {
  const trimmed = name.trim() || "Untitled location";
  const existing = loadSaved();
  const entry: SavedLocation = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: trimmed,
    state,
    savedAt: new Date().toISOString(),
  };
  const next = [entry, ...existing].slice(0, MAX_SAVED);
  return { ok: persist(next), locations: next };
}

export function deleteLocation(id: string): SavedLocation[] {
  const next = loadSaved().filter((location) => location.id !== id);
  persist(next);
  return next;
}

export function renameLocation(id: string, name: string): SavedLocation[] {
  const next = loadSaved().map((location) =>
    location.id === id ? { ...location, name: name.trim() || location.name } : location,
  );
  persist(next);
  return next;
}
