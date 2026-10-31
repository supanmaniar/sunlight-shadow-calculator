export type MapState = {
  lat: number;
  lng: number;
  zoom: number;
  pitch: number;
  bearing: number;
  date: string;
  time: string;
  fov: number;
  radius: number;
};

export const DEFAULT_STATE: MapState = {
  lat: 51.5007,
  lng: -0.1246,
  zoom: 16.2,
  pitch: 60,
  bearing: -20,
  date: "",
  time: "12:00",
  fov: 60,
  radius: 250,
};

function num(value: string | null, fallback: number): number {
  // `Number("")` is `0`, so an empty parameter must be treated as absent
  // rather than as a real coordinate.
  if (value === null || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

/**
 * Accept only a real calendar date. Anything else falls back to `today` so a
 * hand-edited or truncated URL can never produce an `Invalid Date`.
 */
function dateKey(value: string | null, fallback: string): string {
  if (value === null) return fallback;
  const match = DATE_PATTERN.exec(value);
  if (!match) return fallback;
  const [, year, month, day] = match.map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  const roundTrips =
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day;
  return roundTrips ? value : fallback;
}

/** Accept only `HH:mm` within a real day. */
function timeKey(value: string | null, fallback: string): string {
  if (value === null) return fallback;
  const match = TIME_PATTERN.exec(value);
  if (!match) return fallback;
  const [, hour, minute] = match.map(Number);
  return hour <= 23 && minute <= 59 ? value : fallback;
}

/** Parse app state from a query string, falling back to defaults. */
export function parseState(params: URLSearchParams, today: string): MapState {
  return {
    lat: clamp(num(params.get("lat"), DEFAULT_STATE.lat), -85, 85),
    lng: clamp(num(params.get("lng"), DEFAULT_STATE.lng), -180, 180),
    zoom: clamp(num(params.get("z"), DEFAULT_STATE.zoom), 2, 20),
    pitch: clamp(num(params.get("p"), DEFAULT_STATE.pitch), 0, 85),
    bearing: num(params.get("b"), DEFAULT_STATE.bearing),
    date: dateKey(params.get("d"), today),
    time: timeKey(params.get("t"), DEFAULT_STATE.time),
    fov: clamp(num(params.get("fov"), DEFAULT_STATE.fov), 20, 90),
    radius: clamp(num(params.get("r"), DEFAULT_STATE.radius), 50, 2000),
  };
}

/** Serialise app state into a query string. */
export function serializeState(state: MapState): string {
  const params = new URLSearchParams({
    lat: state.lat.toFixed(5),
    lng: state.lng.toFixed(5),
    z: state.zoom.toFixed(2),
    p: state.pitch.toFixed(0),
    b: state.bearing.toFixed(0),
    d: state.date,
    t: state.time,
    fov: state.fov.toFixed(0),
    r: state.radius.toFixed(0),
  });
  return params.toString();
}
