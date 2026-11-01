# Contributing

Thanks for taking a look. This project is small and deliberately dependency-light,
so contributions are easy to review.

## Getting set up

```bash
git clone https://github.com/supanmaniar/sunlight-shadow-calculator.git
cd sunlight-shadow-calculator
npm install
npm run dev
```

No API keys or environment variables are needed.

## Before you open a pull request

Run all four checks locally:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

CI runs the same commands, so a green local run means a green PR.

## Project conventions

### Keep the math pure

Solar and shadow math lives in `src/lib/` and must stay free of React, DOM, and
network calls. That is what makes it testable in Node and reusable elsewhere.

- `src/lib/sun.ts` — solar position and sun times
- `src/lib/shadow/projection.ts` — shadow geometry
- `src/lib/shadow/osm.ts` — Overpass parsing and height inference
- `src/lib/shadow/pmtiles.ts` — Protomaps tile loading

If you change any of these, add or update a test.

### Test against real reference values

Do not assert against numbers you computed with the same code you are testing.
Use an independent source:

- Solar values: the [NOAA Solar Calculator](https://gml.noaa.gov/grad/solcalc/)
- Building heights: a known landmark (e.g. The Shard is 310 m)
- Geometry: hand-computed values with a clear derivation in the test name

### Never read the clock during render

Next.js 16 rejects `new Date()` during prerender. Use the existing
`useNowMs()` hook or a deterministic constant. See
`Knowledge-Vault/Skills/Nextjs-16-prerender-clock.md` if you have the vault.

### Respect the data providers

- Do not increase request rates to Photon or Overpass.
- Do not add autocomplete against the public Nominatim instance; its usage
  policy forbids it. Photon is used for type-ahead instead.
- Do not remove or hide attribution. See [ATTRIBUTION.md](ATTRIBUTION.md).
- Cache aggressively; the scene API already caches for 10 minutes.

## Adding a new data source

1. Add a loader in `src/lib/shadow/`.
2. Return the shared `SceneData` shape from `src/lib/shadow/osm.ts`.
3. Wire it into `src/app/api/scene/route.ts` with a fallback.
4. Add the source and its licence to `ATTRIBUTION.md` **and** to the
   `CREDITS` array in `src/components/shadow/Attribution.tsx`.
5. Add tests for the parsing and coordinate math.

## Reporting bugs

Please include:

- the URL (it encodes the full state),
- what you expected to see,
- what you actually saw,
- a screenshot if it is visual.

## Code style

- TypeScript strict mode is on; avoid `any`.
- Prefer small pure functions over classes.
- Comment only where the reasoning is not obvious from the code.
- Keep components in `src/components/`, logic in `src/lib/`.

## Licence

By contributing you agree that your contribution is licensed under the
[MIT licence](LICENSE).
