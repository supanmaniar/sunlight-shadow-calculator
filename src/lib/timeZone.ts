import tzlookup from "tz-lookup";

/**
 * IANA time zone for a coordinate.
 *
 * This replaces an earlier longitude approximation (`Etc/GMT±n`) which ignored
 * daylight saving entirely — London in June was reported an hour early, so
 * every sunrise, sunset and golden-hour time was wrong for half the year.
 *
 * `tz-lookup` resolves the zone from a bundled boundary table, so this works
 * offline and cannot fail at runtime. It returns a real IANA name, which
 * `Intl.DateTimeFormat` then uses to apply the correct DST rules for the date
 * being displayed.
 */
export function timeZoneFor(latitude: number, longitude: number): string {
  try {
    return tzlookup(latitude, longitude);
  } catch {
    // Outside the boundary table (open ocean, poles). UTC is a safe fallback
    // and is at least honest, unlike a guessed offset.
    return "UTC";
  }
}

/**
 * Short label for a zone at a given instant, e.g. "BST", "EDT", "GMT+5:30".
 *
 * Neither locale names every zone: `en-GB` renders American zones as "GMT-4"
 * instead of "EDT", and `en-US` renders European zones as "GMT+1" instead of
 * "BST". So try both and prefer whichever produced a real abbreviation rather
 * than a numeric offset.
 */
export function timeZoneAbbreviation(instant: Date, timeZone: string): string {
  const nameIn = (locale: string) =>
    new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: "short" })
      .formatToParts(instant)
      .find((part) => part.type === "timeZoneName")?.value ?? "";

  const candidates = [nameIn("en-GB"), nameIn("en-US")];
  const named = candidates.find((value) => value && !/^GMT[+-]/.test(value));
  return named ?? candidates.find(Boolean) ?? timeZone;
}
