<div align="center">

# Sunlight & Shadow Calculator

**Find the perfect light and shade — anywhere on Earth, at any moment.**

Visualize real sunlight and shadow conditions in 3D. Plan photo shoots, events,
hikes, and trips around the sun instead of guessing.

[Features](#features) · [Quick start](#quick-start) · [How it works](#how-it-works) ·
[API](#api) · [Attribution](ATTRIBUTION.md) · [Contributing](CONTRIBUTING.md)

</div>

---

## What it does

Pick a place and a moment. The app extrudes every building around you to its
real height, projects the sun's shadow across the ground, and shows you exactly
where the light will fall.

- **3D buildings with real cast shadows** — real OSM footprints and heights,
  shadows computed from the sun's azimuth and elevation.
- **Sun path arc and compass** — the day's solar arc with a live sun marker.
- **Time and date controls** — scrub the day with a slider or press Play to
  watch the shadows sweep across the city.
- **Camera freedom** — pitch, bearing, zoom, and an adjustable field of view.
- **Golden hour and twilight** — sunrise, sunset, civil/nautical/astronomical
  twilight, and golden/blue hour windows.
- **Trees from OSM** — real tree nodes with crown radius and height.
- **Shareable URLs** — location, date, time, camera, field of view, and area
  radius are all encoded in the URL.
- **Place search** — forward geocoding via OpenStreetMap Nominatim.
- **Adjustable area** — load 100 m to 2 km around the point (up to ~30,000
  buildings).

## Quick start

```bash
git clone https://github.com/supanmaniar/sunlight-shadow-calculator.git
cd sunlight-shadow-calculator
npm install
npm run dev
```

Open <http://localhost:3000>.

No API keys, no accounts, no environment variables. Everything the app needs is
free and open.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm test` | Run the unit tests (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run sync:maplibre-worker` | Copy the MapLibre worker into `public/` |

`postinstall` runs `sync:maplibre-worker` automatically.

## How it works

### 1. Solar position

[`src/lib/sun.ts`](src/lib/sun.ts) implements the NOAA Solar Calculator
equations (based on Meeus, *Astronomical Algorithms*). Given an instant and a
coordinate it returns:

- solar declination and the equation of time,
- azimuth (degrees clockwise from north) and elevation (degrees above horizon),
- sunrise, sunset, solar noon, and the three twilight bands,
- golden hour and blue hour windows.

The math is pure, dependency-free, and unit tested against NOAA reference values
for New York, Sydney, and Tromsø (including polar day and polar night).

### 2. Building geometry

Buildings come from the [Protomaps](https://protomaps.com) planet archive — a
single `.pmtiles` file read with **HTTP range requests**, so only the tiles you
need are transferred. There is no API key, no quota, and no rate limit.

The `buildings` layer carries real `height` and `min_height` values and contains
individual OSM buildings from z15 upward. [`src/lib/shadow/pmtiles.ts`](src/lib/shadow/pmtiles.ts)
computes the covering tiles, fetches them, and decodes the MVT geometry into
lon/lat footprints.

### 3. Shadow projection

[`src/lib/shadow/projection.ts`](src/lib/shadow/projection.ts) projects each
footprint along the sun ray:

```
dx = height / tan(elevation) * sin(azimuth + 180°)
dy = height / tan(elevation) * cos(azimuth + 180°)
```

The shadow polygon is the convex hull of the original footprint and the
translated footprint. This is exact for convex buildings and a close
approximation for the concave ones typical of OSM data.

Trees are projected as offset circles using their crown radius.

### 4. Rendering

[`src/components/shadow/ShadowMap.tsx`](src/components/shadow/ShadowMap.tsx)
drives MapLibre GL:

| Layer | Type | Purpose |
|---|---|---|
| `scene-shadows` | `fill` | Projected shadow polygons |
| `scene-buildings` | `fill-extrusion` | Extruded buildings |
| `scene-trees` | `circle` | Tree crowns |
| `sun-path` | `line` | The day's solar arc |
| `sun-marker` | `circle` | Current sun position on the arc |

Shadows are recomputed and pushed with `setData()` whenever the sun moves.
Projecting 30,000 buildings takes roughly 190 ms, so the time slider stays
responsive.

## Data sources

| Data | Source | Key | Cost | Notes |
|---|---|---|---|---|
| Buildings | [Protomaps](https://protomaps.com) PMTiles | None | Free | No rate limit, range requests |
| Trees | [OpenStreetMap](https://www.openstreetmap.org) via Overpass | None | Free | Best-effort, 4 s cap |
| Basemap | [OpenFreeMap](https://openfreemap.org) | None | Free | "liberty" style |
| Geocoding | [Nominatim](https://nominatim.org) | None | Free | One request per search |
| Sun position | NOAA / Meeus equations | — | — | Local, no network |

**Full licence details and required attributions: [ATTRIBUTION.md](ATTRIBUTION.md).**

### Coverage and scale

| Radius | Buildings | Load time |
|---|---|---|
| 250 m | ~2,000 | ~4 s |
| 1 km | ~10,800 | ~4 s |
| 2 km | ~30,800 | ~4 s |

Verified against The Shard, which resolves to its real 310 m height at
51.5045, −0.0865.

### Fallback behaviour

Three small real OSM extracts are bundled in
[`src/data/scenes.json`](src/data/scenes.json) and used **only if Protomaps is
unreachable**, so the demo still renders offline:

- Vienna (Stephansplatz)
- New York (Times Square)
- London (Trafalgar Square)

They are deliberately small (64–147 buildings) and are not the primary source.

## API

### `GET /api/scene`

```
/api/scene?lat=<number>&lng=<number>&radius=<50-2000>
```

Returns buildings and trees for the area.

```json
{
  "center": [-0.1246, 51.5007],
  "radius": 250,
  "buildings": [
    {
      "id": 12,
      "footprint": [[-0.1247, 51.5008], [-0.1245, 51.5008], [-0.1245, 51.5006]],
      "height": 24,
      "minHeight": 0,
      "kind": "building"
    }
  ],
  "trees": [
    { "id": 99, "center": [-0.1246, 51.5007], "height": 9, "crownRadius": 3 }
  ],
  "fetchedAt": "2026-10-31T18:00:00.000Z",
  "source": "protomaps"
}
```

Responses are cached in-process for 10 minutes. The `X-Scene-Cache` header
reports `hit`, `protomaps`, or `bundled`.

### `GET /api/sun`

```
/api/sun?lat=<number>&lng=<number>&tz=<IANA zone>&date=<ISO 8601>
```

Returns the sun's position and the day's sun times.

```json
{
  "latitude": 51.5007,
  "longitude": -0.1246,
  "timeZone": "Europe/London",
  "position": { "azimuth": 279.1, "elevation": 23.1, "declination": 23.4, "equationOfTime": -1.9 },
  "times": { "sunrise": "...", "sunset": "...", "solarNoon": "...", "polarState": "normal" }
}
```

## Project layout

```
src/
├── app/
│   ├── api/
│   │   ├── scene/route.ts      # buildings + trees
│   │   └── sun/route.ts        # sun position and times
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/shadow/
│   ├── Attribution.tsx         # data credits panel
│   ├── ShadowExplorer.tsx      # UI, controls, URL state
│   └── ShadowMap.tsx           # MapLibre 3D view
├── data/
│   └── scenes.json             # bundled fallback extracts
└── lib/
    ├── sun.ts                  # NOAA solar math
    ├── format.ts               # time and angle formatting
    ├── useNow.ts               # live clock hook
    ├── shadow/
    │   ├── projection.ts       # shadow geometry
    │   ├── pmtiles.ts          # Protomaps building loader
    │   ├── osm.ts              # Overpass parsing, height inference
    │   ├── geojson.ts          # GeoJSON builders
    │   ├── fallback.ts         # bundled scene lookup
    │   ├── geocode.ts          # Nominatim search
    │   └── urlState.ts         # shareable URL encoding
    └── __tests__/              # unit tests
```

## Accuracy notes

- **Shadows** are the convex hull of a footprint and its sun-translated copy.
  Exact for convex buildings, approximate for concave ones.
- **Building heights** come from Protomaps `height`, which derives from OSM
  `height` and `building:levels`. Missing heights default to 8 m.
- **Tree crowns** come from `diameter_crown`, then `circumference`, then 2.5 m.
- **Trees are best-effort.** If Overpass is rate limited the scene loads with
  zero trees rather than failing.
- **Time zones are approximated from longitude** (`Etc/GMT±N`), so DST is not
  applied. Sun times are accurate; wall-clock labels may differ by an hour in
  DST regions.
- **No terrain elevation**, so hills do not cast shadows.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack, Cache Components) |
| UI | React 19, Tailwind CSS 4 |
| Map | MapLibre GL JS 6 |
| Tiles | Protomaps PMTiles |
| Tests | Vitest |
| Language | TypeScript 5 (strict) |

## Deployment

The app is a standard Next.js project and deploys to any Node host.

### Vercel

```bash
npx vercel --prod
```

No environment variables are required.

### Docker

```bash
docker build -t sunlight-shadow-calculator .
docker run -p 3000:3000 sunlight-shadow-calculator
```

### Any Node host

```bash
npm ci
npm run build
npm start
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Issues and pull requests are welcome.

## Licence

Source code: [MIT](LICENSE).

Map data and third-party services: see [ATTRIBUTION.md](ATTRIBUTION.md).

---

<div align="center">

Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors ·
Tiles by [Protomaps](https://protomaps.com) ·
Basemap by [OpenFreeMap](https://openfreemap.org) ·
Solar equations from [NOAA](https://gml.noaa.gov/grad/solcalc/)

</div>
