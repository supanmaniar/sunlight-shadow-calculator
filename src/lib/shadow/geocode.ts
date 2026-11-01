export type GeocodeResult = {
  label: string;
  detail: string;
  latitude: number;
  longitude: number;
};

type PhotonFeature = {
  properties?: {
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    district?: string;
    county?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
  geometry?: { coordinates?: [number, number] };
};

const PHOTON_URL = "https://photon.komoot.io/api/";

function coordinateResult(latitude: number, longitude: number): GeocodeResult {
  return {
    label: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
    detail: "Coordinates",
    latitude,
    longitude,
  };
}

/**
 * Parse a pasted coordinate pair. People copy coordinates from Google Maps in
 * several shapes, so accept the common ones:
 *   51.5045, -0.0865
 *   -0.0865, 51.5045   (some tools emit lng,lat — resolved by range)
 *   51°30'16.2"N 0°05'11.4"W
 *   geo:51.5045,-0.0865
 */
export function parseCoordinates(input: string): GeocodeResult | null {
  const text = input.trim().replace(/^geo:/i, "");

  const decimal = text.match(
    /^(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/,
  );
  if (decimal) {
    const first = Number(decimal[1]);
    const second = Number(decimal[2]);
    if (Math.abs(first) <= 90 && Math.abs(second) <= 180) {
      return coordinateResult(first, second);
    }
    // Reversed order (lng, lat), common when copying from some map tools.
    if (Math.abs(second) <= 90 && Math.abs(first) <= 180) {
      return coordinateResult(second, first);
    }
    return null;
  }

  const dms = text.match(
    /(\d{1,3})°\s*(\d{1,2})?'?\s*(\d{1,2}(?:\.\d+)?)?"?\s*([NS])\s*[,;\s]*(\d{1,3})°\s*(\d{1,2})?'?\s*(\d{1,2}(?:\.\d+)?)?"?\s*([EW])/i,
  );
  if (dms) {
    const lat =
      Number(dms[1]) + Number(dms[2] ?? 0) / 60 + Number(dms[3] ?? 0) / 3600;
    const lng =
      Number(dms[5]) + Number(dms[6] ?? 0) / 60 + Number(dms[7] ?? 0) / 3600;
    return coordinateResult(
      dms[4].toUpperCase() === "S" ? -lat : lat,
      dms[8].toUpperCase() === "W" ? -lng : lng,
    );
  }

  return null;
}

function describe(properties: PhotonFeature["properties"]): string {
  if (!properties) return "";
  const parts = [
    properties.street && properties.housenumber
      ? `${properties.street} ${properties.housenumber}`
      : properties.street,
    properties.district,
    properties.city,
    properties.state,
    properties.country,
  ].filter((part): part is string => Boolean(part));

  // Drop consecutive duplicates, e.g. "London, London".
  return parts.filter((part, index) => part !== parts[index - 1]).join(", ");
}

/**
 * Search for places by name.
 *
 * Uses Photon (komoot) rather than Nominatim: Photon is built for
 * search-as-you-type and tolerates partial words, while the public Nominatim
 * instance explicitly forbids autocomplete. `bias` ranks results near the
 * current view first, which is what makes "Trafalgar" resolve to London
 * instead of Madrid.
 */
export async function geocode(
  query: string,
  bias?: { latitude: number; longitude: number },
  signal?: AbortSignal,
): Promise<GeocodeResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const coordinates = parseCoordinates(trimmed);
  if (coordinates) return [coordinates];

  const url = new URL(PHOTON_URL);
  url.searchParams.set("q", trimmed);
  url.searchParams.set("limit", "6");
  url.searchParams.set("lang", "en");
  if (bias) {
    url.searchParams.set("lat", bias.latitude.toFixed(5));
    url.searchParams.set("lon", bias.longitude.toFixed(5));
  }

  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Geocoding failed (${response.status})`);

  const payload = (await response.json()) as { features?: PhotonFeature[] };
  const results: GeocodeResult[] = [];

  for (const feature of payload.features ?? []) {
    const coordinates = feature.geometry?.coordinates;
    if (!coordinates) continue;
    const [longitude, latitude] = coordinates;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

    const label =
      feature.properties?.name ?? feature.properties?.street ?? "Unnamed place";
    const detail = describe(feature.properties);

    // Photon returns the same place once per OSM object (node, way, relation),
    // with centroids up to ~150 m apart. Collapse entries that share a name and
    // either the same address or a very close position.
    const duplicate = results.some(
      (existing) =>
        existing.label === label &&
        (existing.detail === detail ||
          (Math.abs(existing.latitude - latitude) < 0.0025 &&
            Math.abs(existing.longitude - longitude) < 0.0025)),
    );
    if (duplicate) continue;

    results.push({ label, detail, latitude, longitude });
  }

  return results;
}
