"use client";

import { useState } from "react";

type Credit = {
  name: string;
  href: string;
  role: string;
  licence: string;
};

const CREDITS: Credit[] = [
  {
    name: "OpenStreetMap",
    href: "https://www.openstreetmap.org/copyright",
    role: "Building footprints, heights, and tree data",
    licence: "ODbL 1.0",
  },
  {
    name: "Protomaps",
    href: "https://protomaps.com",
    role: "Planet-scale 3D building tiles (PMTiles)",
    licence: "ODbL 1.0",
  },
  {
    name: "OpenFreeMap",
    href: "https://openfreemap.org",
    role: "Vector basemap and map style",
    licence: "ODbL 1.0",
  },
  {
    name: "OpenMapTiles",
    href: "https://www.openmaptiles.org/",
    role: "Vector tile schema",
    licence: "CC-BY 4.0",
  },
  {
    name: "MapLibre GL JS",
    href: "https://maplibre.org",
    role: "3D map rendering engine",
    licence: "BSD-3-Clause",
  },
  {
    name: "Photon (komoot)",
    href: "https://photon.komoot.io",
    role: "Place search geocoding",
    licence: "ODbL 1.0",
  },
  {
    name: "Overpass API",
    href: "https://overpass-api.de",
    role: "Tree data enrichment",
    licence: "ODbL 1.0",
  },
  {
    name: "NOAA Solar Calculator",
    href: "https://gml.noaa.gov/grad/solcalc/",
    role: "Solar position equations",
    licence: "Public domain",
  },
  {
    name: "Meeus, Astronomical Algorithms",
    href: "https://www.willbell.com/math/mc1.htm",
    role: "Solar declination and equation of time",
    licence: "Reference",
  },
  {
    name: "Natural Earth",
    href: "https://www.naturalearthdata.com/",
    role: "Shaded relief raster",
    licence: "Public domain",
  },
];

export function Attribution() {
  const [open, setOpen] = useState(false);

  return (
    <div className="pointer-events-auto">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="rounded-lg border border-stone-700 bg-stone-900/85 px-2.5 py-1 text-xs text-stone-300 backdrop-blur transition-colors hover:border-amber-500 hover:text-amber-300"
      >
        Data &amp; credits
      </button>

      {open && (
        <div className="absolute bottom-10 right-0 z-20 max-h-[60vh] w-80 overflow-auto rounded-xl border border-stone-700 bg-stone-900/95 p-4 text-xs backdrop-blur">
          <h2 className="mb-2 text-sm font-semibold text-stone-100">
            Data sources &amp; credits
          </h2>
          <p className="mb-3 text-stone-400">
            This project stands on free and open data. Please respect each
            provider&apos;s usage policy.
          </p>
          <ul className="space-y-2.5">
            {CREDITS.map((credit) => (
              <li key={credit.name}>
                <a
                  href={credit.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-amber-400 hover:underline"
                >
                  {credit.name}
                </a>
                <span className="text-stone-500"> · {credit.licence}</span>
                <p className="text-stone-400">{credit.role}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-stone-700 pt-2 text-stone-500">
            Map data © OpenStreetMap contributors, available under the Open
            Database License.
          </p>
        </div>
      )}
    </div>
  );
}
