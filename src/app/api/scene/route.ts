import { NextResponse } from "next/server";
import {
  buildOverpassQuery,
  parseOverpassResponse,
  type SceneData,
} from "@/lib/shadow/osm";
import { getBundledScene } from "@/lib/shadow/fallback";
import { loadScene as loadPmtilesScene } from "@/lib/shadow/pmtiles";

const MAX_RADIUS = 2000;
const MIN_RADIUS = 50;
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 60;

type CacheEntry = { data: SceneData; expires: number };

// Module-level cache survives across requests in the same server process.
const cache = new Map<string, CacheEntry>();

function readCache(key: string): SceneData | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expires < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function writeCache(key: string, data: SceneData) {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { data, expires: Date.now() + CACHE_TTL_MS });
}

function parseNumber(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Overpass is the only source with individual trees, so it is used to enrich
 * the Protomaps buildings. Failure is non-fatal: buildings still render.
 */
async function fetchTrees(
  latitude: number,
  longitude: number,
  radius: number,
): Promise<SceneData["trees"]> {
  const query = buildOverpassQuery(latitude, longitude, radius);

  try {
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "ShadowmapExplorer/0.1 (local development)",
      },
      body: new URLSearchParams({ data: query }),
      // Trees are a nice-to-have; never let them delay the buildings.
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return [];
    return parseOverpassResponse(await response.json()).trees;
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const latitude = parseNumber(searchParams.get("lat"));
  const longitude = parseNumber(searchParams.get("lng"));
  const radius = parseNumber(searchParams.get("radius")) ?? 250;

  if (latitude === null || Math.abs(latitude) > 90) {
    return NextResponse.json(
      { error: "Query parameter 'lat' must be a number between -90 and 90." },
      { status: 400 },
    );
  }

  if (longitude === null || Math.abs(longitude) > 180) {
    return NextResponse.json(
      { error: "Query parameter 'lng' must be a number between -180 and 180." },
      { status: 400 },
    );
  }

  if (radius < MIN_RADIUS || radius > MAX_RADIUS) {
    return NextResponse.json(
      {
        error: `Query parameter 'radius' must be between ${MIN_RADIUS} and ${MAX_RADIUS}.`,
      },
      { status: 400 },
    );
  }

  const key = `${latitude.toFixed(4)},${longitude.toFixed(4)},${Math.round(radius)}`;
  const cached = readCache(key);
  if (cached) {
    return NextResponse.json(cached, { headers: { "X-Scene-Cache": "hit" } });
  }

  // Protomaps is the primary building source: no key, no rate limit, and it
  // covers the whole planet via HTTP range requests.
  try {
    // Buildings and trees are independent, so fetch them concurrently.
    const [scene, trees] = await Promise.all([
      loadPmtilesScene(longitude, latitude, radius),
      fetchTrees(latitude, longitude, radius),
    ]);
    const enriched: SceneData = { ...scene, trees };

    writeCache(key, enriched);
    return NextResponse.json(enriched, {
      headers: { "X-Scene-Cache": "protomaps" },
    });
  } catch {
    // Last resort: a small bundled extract so the demo still renders offline.
    const bundled = getBundledScene(latitude, longitude);
    if (bundled) {
      writeCache(key, bundled);
      return NextResponse.json(bundled, {
        headers: { "X-Scene-Cache": "bundled" },
      });
    }

    return NextResponse.json(
      {
        error:
          "Could not load 3D building data. Check your connection and try again.",
      },
      { status: 503 },
    );
  }
}
