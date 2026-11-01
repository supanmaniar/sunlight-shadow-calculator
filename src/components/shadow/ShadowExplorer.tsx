"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Attribution } from "@/components/shadow/Attribution";
import { ShadowMap } from "@/components/shadow/ShadowMap";
import { geocode, type GeocodeResult } from "@/lib/shadow/geocode";
import type { SceneData } from "@/lib/shadow/osm";
import { parseState, serializeState, type MapState } from "@/lib/shadow/urlState";
import {
  compassDirection,
  formatDegrees,
  formatDuration,
  formatTime,
} from "@/lib/format";
import { getSunPosition, getSunTimes, zonedTimeToUtc } from "@/lib/sun";
import { useNowMs } from "@/lib/useNow";

function subscribeToNothing() {
  return () => {};
}

const PRESETS = [
  { label: "Trafalgar Sq", lat: 51.5007, lng: -0.1246 },
  { label: "The Shard", lat: 51.5045, lng: -0.0865 },
  { label: "Canary Wharf", lat: 51.5054, lng: -0.0235 },
  { label: "Vienna", lat: 48.2082, lng: 16.3738 },
  { label: "Times Square", lat: 40.758, lng: -73.9855 },
];

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localTimeKey(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function timeZoneFor(lat: number, lng: number): string {
  // Approximate zone from longitude; good enough for display and sun times.
  // Note: Etc/GMT signs are inverted relative to UTC offsets (Etc/GMT-2 is UTC+2).
  const offsetHours = Math.round(lng / 15);
  const sign = offsetHours >= 0 ? "-" : "+";
  const abs = Math.abs(offsetHours);
  return `Etc/GMT${sign}${abs}`;
}

/**
 * Client-only gate. The map cannot be prerendered, so the server emits a stable
 * skeleton and the explorer mounts on the client where it can read the URL and
 * the clock safely.
 */
export function ShadowExplorer() {
  const mounted = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );

  if (!mounted) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-stone-950 text-stone-400">
        <p className="text-sm">Loading Sunlight &amp; Shadow Calculator…</p>
      </div>
    );
  }

  return <ShadowExplorerClient />;
}

function ShadowExplorerClient() {
  const nowMs = useNowMs();
  const now = useMemo(() => new Date(nowMs), [nowMs]);

  const [state, setState] = useState<MapState>(() =>
    parseState(new URLSearchParams(window.location.search), localDateKey(new Date())),
  );

  const [sceneState, setSceneState] = useState<{
    key: string;
    data: SceneData | null;
    error: string | null;
  }>({ key: "", data: null, error: null });
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState<{
    query: string;
    results: GeocodeResult[];
  }>({ query: "", results: [] });
  const [activeIndex, setActiveIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const [playing, setPlaying] = useState(false);

  const timeZone = useMemo(
    () => timeZoneFor(state.lat, state.lng),
    [state.lat, state.lng],
  );

  const instant = useMemo(
    () => zonedTimeToUtc(state.date, state.time, timeZone),
    [state.date, state.time, timeZone],
  );

  const position = useMemo(
    () => getSunPosition(instant, state.lat, state.lng),
    [instant, state.lat, state.lng],
  );

  const times = useMemo(
    () => getSunTimes(instant, state.lat, state.lng, timeZone),
    [instant, state.lat, state.lng, timeZone],
  );

  const positionAt = useCallback(
    (date: Date) => getSunPosition(date, state.lat, state.lng),
    [state.lat, state.lng],
  );

  // Keep the URL in sync so any view can be shared.
  useEffect(() => {
    const url = `${window.location.pathname}?${serializeState(state)}`;
    window.history.replaceState(null, "", url);
  }, [state]);

  // Load the 3D scene for the current location. The requested key is stored
  // with the result so loading state is derived rather than set in the effect.
  const sceneKey = `${state.lat.toFixed(4)},${state.lng.toFixed(4)},${state.radius}`;

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/scene?lat=${state.lat}&lng=${state.lng}&radius=${state.radius}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Failed to load scene");
        return payload as SceneData;
      })
      .then((data) => setSceneState({ key: sceneKey, data, error: null }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSceneState({
          key: sceneKey,
          data: null,
          error: error instanceof Error ? error.message : "Failed to load scene",
        });
      });

    return () => controller.abort();
  }, [state.lat, state.lng, state.radius, sceneKey]);

  const sceneReady = sceneState.key === sceneKey;
  const scene = sceneReady ? sceneState.data : null;
  const sceneError = sceneReady ? sceneState.error : null;
  const loadingScene = !sceneReady;

  // Animate the sun through the day.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setState((prev) => {
        const [hours, minutes] = prev.time.split(":").map(Number);
        const total = (hours * 60 + minutes + 10) % (24 * 60);
        return {
          ...prev,
          time: `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`,
        };
      });
    }, 120);
    return () => clearInterval(id);
  }, [playing, setState]);

  // Debounced search-as-you-type. Photon tolerates partial words, so results
  // appear while typing instead of only on Enter. Each keystroke aborts the
  // previous request so a slow response can never overwrite a newer one.
  //
  // The requested query is stored alongside the results, so "is a search in
  // flight" and "are these results stale" are derived rather than set in the
  // effect body.
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      geocode(trimmed, { latitude: state.lat, longitude: state.lng }, controller.signal)
        .then((found) => {
          setSearchState({ query: trimmed, results: found });
          setActiveIndex(0);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setSearchState({ query: trimmed, results: [] });
        });
    }, 220);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `state.lat`/`state.lng` are read as a bias only; re-running on every
    // camera move would spam the geocoder, so they are intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const trimmedQuery = query.trim();
  const results = searchState.query === trimmedQuery ? searchState.results : [];
  const searching = trimmedQuery.length >= 2 && searchState.query !== trimmedQuery;

  const goTo = (lat: number, lng: number) => {
    setState((prev) => ({ ...prev, lat, lng }));
    setSearchState({ query: "", results: [] });
    setQuery("");
    setActiveIndex(0);
  };

  const chooseResult = (result: GeocodeResult) => {
    goTo(result.latitude, result.longitude);
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const sunUp = position.elevation > 0;
  const goldenHour =
    position.elevation > -0.833 && position.elevation < 6;

  return (
    <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-stone-950 text-stone-100">
      <div className="absolute inset-0">
        <ShadowMap
          center={[state.lng, state.lat]}
          scene={scene}
          position={position}
          dateKey={state.date}
          fov={state.fov}
          positionAt={positionAt}
          onCameraChange={({ pitch, bearing, zoom }) =>
            setState((prev) =>
              Math.abs(prev.pitch - pitch) < 0.5 &&
              Math.abs(prev.bearing - bearing) < 0.5 &&
              Math.abs(prev.zoom - zoom) < 0.01
                ? prev
                : { ...prev, pitch, bearing, zoom },
            )
          }
        />
      </div>

      {/* Top bar */}
      <header className="pointer-events-none relative z-10 flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="pointer-events-auto rounded-xl bg-stone-900/85 px-4 py-3 backdrop-blur">
          <h1 className="text-lg font-semibold tracking-tight">Sunlight &amp; Shadow Calculator</h1>
          <p className="text-xs text-stone-400">
            Find the perfect light &amp; shade, anywhere on Earth.
          </p>
        </div>

        <div className="pointer-events-auto flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActiveIndex((index) =>
                    results.length === 0 ? 0 : (index + 1) % results.length,
                  );
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveIndex((index) =>
                    results.length === 0
                      ? 0
                      : (index - 1 + results.length) % results.length,
                  );
                } else if (event.key === "Enter") {
                  event.preventDefault();
                  const chosen = results[activeIndex];
                  if (chosen) chooseResult(chosen);
                } else if (event.key === "Escape") {
                  setQuery("");
                  setSearchState({ query: "", results: [] });
                }
              }}
              placeholder="Search a place or paste coordinates…"
              aria-label="Search a place or paste coordinates"
              autoComplete="off"
              spellCheck={false}
              className="w-64 rounded-lg border border-stone-700 bg-stone-900/85 px-3 py-2 text-sm outline-none backdrop-blur placeholder:text-stone-500 focus:border-amber-500"
            />
            <button
              type="button"
              onClick={() => {
                const chosen = results[activeIndex];
                if (chosen) chooseResult(chosen);
              }}
              disabled={searching || results.length === 0}
              className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-stone-950 transition-colors hover:bg-amber-400 disabled:opacity-50"
            >
              {searching ? "…" : "Go"}
            </button>
          </div>

          {results.length > 0 && (
            <ul className="max-h-64 w-80 overflow-auto rounded-lg border border-stone-700 bg-stone-900/95 text-sm shadow-xl backdrop-blur">
              {results.map((result, index) => (
                <li key={`${result.latitude},${result.longitude},${result.label}`}>
                  <button
                    type="button"
                    onClick={() => chooseResult(result)}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`w-full px-3 py-2 text-left transition-colors ${
                      index === activeIndex ? "bg-stone-800" : "hover:bg-stone-800"
                    }`}
                  >
                    <span className="block truncate font-medium">{result.label}</span>
                    {result.detail && (
                      <span className="block truncate text-xs text-stone-400">
                        {result.detail}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => goTo(preset.lat, preset.lng)}
                className="rounded-full border border-stone-700 bg-stone-900/85 px-2.5 py-1 text-xs backdrop-blur transition-colors hover:border-amber-500 hover:text-amber-300"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Sun readout */}
      <div className="pointer-events-auto absolute right-4 top-40 z-10 w-64 rounded-xl bg-stone-900/85 p-4 text-sm backdrop-blur">
        <div className="flex items-center justify-between">
          <span className="text-stone-400">Sun</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              sunUp
                ? goldenHour
                  ? "bg-amber-500/20 text-amber-300"
                  : "bg-yellow-500/20 text-yellow-200"
                : "bg-slate-500/20 text-slate-300"
            }`}
          >
            {sunUp ? (goldenHour ? "Golden hour" : "Daylight") : "Below horizon"}
          </span>
        </div>
        <dl className="mt-3 space-y-1.5 font-mono text-xs">
          <div className="flex justify-between">
            <dt className="text-stone-400">Azimuth</dt>
            <dd>
              {formatDegrees(position.azimuth)} {compassDirection(position.azimuth)}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone-400">Elevation</dt>
            <dd>{formatDegrees(position.elevation)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone-400">Sunrise</dt>
            <dd>{formatTime(times.sunrise, timeZone)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone-400">Sunset</dt>
            <dd>{formatTime(times.sunset, timeZone)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-stone-400">Day length</dt>
            <dd>{formatDuration(times.dayLengthMinutes)}</dd>
          </div>
        </dl>

        {scene && (
          <p className="mt-3 border-t border-stone-700 pt-2 text-xs text-stone-400">
            {scene.buildings.length} buildings · {scene.trees.length} trees
          </p>
        )}
        {loadingScene && <p className="mt-2 text-xs text-amber-400">Loading 3D data…</p>}
        {sceneError && <p className="mt-2 text-xs text-red-400">{sceneError}</p>}
      </div>

      {/* Bottom controls */}
      <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-10 p-4">
        <div className="mx-auto flex max-w-4xl flex-col gap-3 rounded-xl bg-stone-900/90 p-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPlaying((prev) => !prev)}
              className="w-20 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-stone-950 hover:bg-amber-400"
            >
              {playing ? "Pause" : "Play"}
            </button>
            <input
              type="range"
              min={0}
              max={1439}
              step={5}
              value={
                Number(state.time.split(":")[0]) * 60 +
                Number(state.time.split(":")[1])
              }
              onChange={(event) => {
                const total = Number(event.target.value);
                setState((prev) => ({
                  ...prev,
                  time: `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`,
                }));
              }}
              className="flex-1 accent-amber-500"
              aria-label="Time of day"
            />
            <span className="w-14 text-right font-mono text-sm">{state.time}</span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              <span className="text-stone-400">Date</span>
              <input
                type="date"
                value={state.date}
                onChange={(event) =>
                  setState((prev) => ({ ...prev, date: event.target.value }))
                }
                className="rounded-lg border border-stone-700 bg-stone-950 px-2 py-1"
              />
            </label>

            <button
              type="button"
              onClick={() =>
                setState((prev) => ({
                  ...prev,
                  date: localDateKey(now),
                  time: localTimeKey(now),
                }))
              }
              className="rounded-lg border border-stone-700 px-2.5 py-1 hover:border-amber-500"
            >
              Now
            </button>

            <label className="flex items-center gap-2">
              <span className="text-stone-400">Area</span>
              <input
                type="range"
                min={100}
                max={2000}
                step={100}
                value={state.radius}
                onChange={(event) =>
                  setState((prev) => ({
                    ...prev,
                    radius: Number(event.target.value),
                  }))
                }
                className="w-24 accent-amber-500"
                aria-label="Area radius"
              />
              <span className="w-12 font-mono text-xs">
                {state.radius >= 1000
                  ? `${(state.radius / 1000).toFixed(1)}km`
                  : `${state.radius}m`}
              </span>
            </label>

            <label className="flex items-center gap-2">
              <span className="text-stone-400">FOV</span>
              <input
                type="range"
                min={20}
                max={90}
                value={state.fov}
                onChange={(event) =>
                  setState((prev) => ({ ...prev, fov: Number(event.target.value) }))
                }
                className="w-24 accent-amber-500"
                aria-label="Field of view"
              />
              <span className="w-8 font-mono text-xs">{state.fov}°</span>
            </label>

            <div className="relative ml-auto flex items-center gap-2">
              <Attribution />
              <button
                type="button"
                onClick={() => void copyLink()}
                className="rounded-lg border border-stone-700 px-2.5 py-1 hover:border-amber-500"
              >
                {copied ? "Copied!" : "Copy link"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
