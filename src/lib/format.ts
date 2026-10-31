export function formatTime(date: Date | null, timeZone: string): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function formatDuration(minutes: number | null): string {
  if (minutes === null) return "—";
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return `${hours}h ${String(mins).padStart(2, "0")}m`;
}

export function formatDegrees(value: number): string {
  return `${value.toFixed(1)}°`;
}

const COMPASS_POINTS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
];

export function compassDirection(azimuth: number): string {
  const index = Math.round((((azimuth % 360) + 360) % 360) / 22.5) % 16;
  return COMPASS_POINTS[index];
}

function partsInZone(date: Date, timeZone: string, options: Intl.DateTimeFormatOptions) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, ...options }).formatToParts(date);
  return (type: string) => parts.find((part) => part.type === type)?.value ?? "";
}

/** Calendar date (`YYYY-MM-DD`) of an instant in a time zone. */
export function dateKeyAt(date: Date, timeZone: string): string {
  const get = partsInZone(date, timeZone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Wall-clock time (`HH:mm`) of an instant in a time zone. */
export function timeKeyAt(date: Date, timeZone: string): string {
  const get = partsInZone(date, timeZone, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  return `${get("hour")}:${get("minute")}`;
}
