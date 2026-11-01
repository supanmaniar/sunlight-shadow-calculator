# Attribution

Sunlight & Shadow Calculator is built entirely on free and open data and
open-source software. This file lists every external resource the app uses at
runtime, what it provides, and the licence it is used under.

If you fork or deploy this project, **keep these attributions visible**. Several
of the licences below (notably ODbL) legally require it.

## Map data

### OpenStreetMap

- **Provides:** building footprints, building heights, tree positions, place
  names, and the underlying map data for every basemap layer.
- **Licence:** [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/)
- **Attribution:** © OpenStreetMap contributors
- **Link:** https://www.openstreetmap.org/copyright

ODbL requires that you credit OpenStreetMap and keep derived data under the
same licence. The in-app "Data & credits" panel and the map's own attribution
control both satisfy this.

### Protomaps

- **Provides:** planet-scale vector tiles containing individual building
  footprints with `height` and `min_height`, served as a single PMTiles archive
  over HTTP range requests.
- **Licence:** ODbL 1.0 (derived from OpenStreetMap)
- **Link:** https://protomaps.com
- **Archive:** https://build.protomaps.com/

### OpenFreeMap

- **Provides:** the vector basemap and the "liberty" map style.
- **Licence:** ODbL 1.0 (data), style under its own terms
- **Link:** https://openfreemap.org

### OpenMapTiles

- **Provides:** the vector tile schema used by the basemap style.
- **Licence:** [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- **Link:** https://www.openmaptiles.org/

### Natural Earth

- **Provides:** shaded relief raster used by the basemap at low zoom levels.
- **Licence:** Public domain
- **Link:** https://www.naturalearthdata.com/

## Services

### Photon (komoot)

- **Provides:** search-as-you-type place lookup for the search box, including
  partial words and location-biased ranking.
- **Licence:** ODbL 1.0 (data, from OpenStreetMap)
- **Link:** https://photon.komoot.io
- **Source:** https://github.com/komoot/photon

Photon is used instead of Nominatim because the public Nominatim instance
explicitly forbids autocomplete ("you must not implement such a service on the
client side using the API"). Photon is built for search-as-you-type. The demo
server asks that request volume stay reasonable; this app issues one debounced
request per pause in typing, aborts superseded requests, and can be pointed at a
self-hosted Photon instance by changing `PHOTON_URL` in
`src/lib/shadow/geocode.ts`.

### Overpass API

- **Provides:** individual tree nodes (`natural=tree`) with height and crown
  data, used to enrich the Protomaps buildings.
- **Licence:** ODbL 1.0 (data)
- **Link:** https://overpass-api.de
- **Usage policy:** https://operations.osmfoundation.org/policies/api/

Overpass is queried best-effort with a 4-second cap. If it is rate limited the
scene still loads, just without trees.

## Solar mathematics

### NOAA Solar Calculator

- **Provides:** the equations for solar declination, equation of time, solar
  azimuth, solar elevation, and sunrise/sunset hour angles.
- **Licence:** Public domain (U.S. Government work)
- **Link:** https://gml.noaa.gov/grad/solcalc/

### Jean Meeus, *Astronomical Algorithms*

- **Provides:** the underlying low-precision solar position series that the NOAA
  calculator is based on.
- **Licence:** Reference work (equations are not copyrightable)
- **Link:** https://www.willbell.com/math/mc1.htm

The implementation lives in [`src/lib/sun.ts`](src/lib/sun.ts) and is verified
against NOAA reference values in
[`src/lib/__tests__/sun.test.ts`](src/lib/__tests__/sun.test.ts).

## Open-source software

| Package | Licence | Purpose |
|---|---|---|
| [Next.js](https://nextjs.org) | MIT | React framework |
| [React](https://react.dev) | MIT | UI library |
| [MapLibre GL JS](https://maplibre.org) | BSD-3-Clause | 3D map rendering |
| [PMTiles](https://github.com/protomaps/PMTiles) | BSD-3-Clause | PMTiles archive reader |
| [@mapbox/vector-tile](https://github.com/mapbox/vector-tile-js) | BSD-3-Clause | MVT decoding |
| [pbf](https://github.com/mapbox/pbf) | BSD-3-Clause | Protocol buffer decoding |
| [Tailwind CSS](https://tailwindcss.com) | MIT | Styling |
| [Vitest](https://vitest.dev) | MIT | Unit testing |
| [TypeScript](https://www.typescriptlang.org) | Apache-2.0 | Type system |

## Fonts

- **Geist** and **Geist Mono** by Vercel, licensed under the
  [SIL Open Font License 1.1](https://openfontlicense.org/), served via
  `next/font`.

## How attribution is surfaced in the app

1. **Map attribution control** — MapLibre renders "OpenFreeMap", "© OpenMapTiles",
   and "Data from OpenStreetMap" in the corner of the map.
2. **"Data & credits" panel** — a button in the bottom control bar opens a list
   of every source above with its licence and link.
3. **This file** — the canonical, complete list for the repository.

## Reporting an attribution problem

If you believe a source is missing or misattributed, please open an issue. We
would rather over-credit than under-credit.
