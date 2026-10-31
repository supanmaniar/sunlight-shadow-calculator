export type GeocodeResult = {
  label: string;
  latitude: number;
  longitude: number;
};

type NominatimItem = {
  display_name?: string;
  lat?: string;
  lon?: string;
};

/** Forward-geocode a free-text place name using OpenStreetMap Nominatim. */
export async function geocode(query: string): Promise<GeocodeResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", trimmed);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Geocoding failed (${response.status})`);

  const items = (await response.json()) as NominatimItem[];
  return items
    .filter((item) => item.lat && item.lon)
    .map((item) => ({
      label: item.display_name ?? "Unknown place",
      latitude: Number(item.lat),
      longitude: Number(item.lon),
    }));
}
