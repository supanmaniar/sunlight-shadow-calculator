/**
 * Solar position and sun-time calculations based on the NOAA Solar Calculator
 * algorithms (Meeus, "Astronomical Algorithms"). All angles are in degrees and
 * all returned `Date` values are absolute instants (UTC internally).
 */

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

/** Standard sunrise/sunset elevation, accounting for refraction and solar radius. */
export const SUNRISE_ELEVATION = -0.833;

export type SunPosition = {
  /** Degrees clockwise from true north. */
  azimuth: number;
  /** Degrees above the horizon (negative when the sun is below it). */
  elevation: number;
  /** Solar declination in degrees. */
  declination: number;
  /** Equation of time in minutes. */
  equationOfTime: number;
};

export type PolarState = "normal" | "polar-day" | "polar-night";

export type SunTimes = {
  solarNoon: Date;
  sunrise: Date | null;
  sunset: Date | null;
  dayLengthMinutes: number | null;
  civilDawn: Date | null;
  civilDusk: Date | null;
  nauticalDawn: Date | null;
  nauticalDusk: Date | null;
  astronomicalDawn: Date | null;
  astronomicalDusk: Date | null;
  goldenHourMorningStart: Date | null;
  goldenHourMorningEnd: Date | null;
  goldenHourEveningStart: Date | null;
  goldenHourEveningEnd: Date | null;
  blueHourMorningStart: Date | null;
  blueHourMorningEnd: Date | null;
  blueHourEveningStart: Date | null;
  blueHourEveningEnd: Date | null;
  polarState: PolarState;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function toJulianDay(date: Date): number {
  return date.getTime() / MS_PER_DAY + 2440587.5;
}

type SolarParams = {
  declination: number;
  equationOfTime: number;
};

function solarParams(julianDay: number): SolarParams {
  const t = (julianDay - 2451545) / 36525;

  const meanLongitude = normalizeDegrees(
    280.46646 + t * (36000.76983 + t * 0.0003032),
  );
  const meanAnomaly = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);

  const meanAnomalyRad = meanAnomaly * DEG_TO_RAD;
  const equationOfCenter =
    Math.sin(meanAnomalyRad) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * meanAnomalyRad) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * meanAnomalyRad) * 0.000289;

  const trueLongitude = meanLongitude + equationOfCenter;
  const omega = 125.04 - 1934.136 * t;
  const apparentLongitude =
    trueLongitude - 0.00569 - 0.00478 * Math.sin(omega * DEG_TO_RAD);

  const meanObliquity =
    23 +
    (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliquity = meanObliquity + 0.00256 * Math.cos(omega * DEG_TO_RAD);

  const declination =
    Math.asin(
      Math.sin(obliquity * DEG_TO_RAD) *
        Math.sin(apparentLongitude * DEG_TO_RAD),
    ) * RAD_TO_DEG;

  const y = Math.tan((obliquity * DEG_TO_RAD) / 2) ** 2;
  const meanLongitudeRad = meanLongitude * DEG_TO_RAD;
  const equationOfTime =
    4 *
    RAD_TO_DEG *
    (y * Math.sin(2 * meanLongitudeRad) -
      2 * eccentricity * Math.sin(meanAnomalyRad) +
      4 *
        eccentricity *
        y *
        Math.sin(meanAnomalyRad) *
        Math.cos(2 * meanLongitudeRad) -
      0.5 * y * y * Math.sin(4 * meanLongitudeRad) -
      1.25 * eccentricity * eccentricity * Math.sin(2 * meanAnomalyRad));

  return { declination, equationOfTime };
}

/** Sun position for an exact instant and observer location. */
export function getSunPosition(
  date: Date,
  latitude: number,
  longitude: number,
): SunPosition {
  const julianDay = toJulianDay(date);
  const { declination, equationOfTime } = solarParams(julianDay);

  const minutesUtc =
    (((date.getTime() % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY) / MS_PER_MINUTE;
  const trueSolarTime =
    (((minutesUtc + equationOfTime + 4 * longitude) % 1440) + 1440) % 1440;
  const hourAngle = trueSolarTime / 4 - 180;

  const latRad = latitude * DEG_TO_RAD;
  const decRad = declination * DEG_TO_RAD;
  const hourAngleRad = hourAngle * DEG_TO_RAD;

  const cosZenith = clamp(
    Math.sin(latRad) * Math.sin(decRad) +
      Math.cos(latRad) * Math.cos(decRad) * Math.cos(hourAngleRad),
    -1,
    1,
  );
  const zenith = Math.acos(cosZenith);
  const elevation = 90 - zenith * RAD_TO_DEG;

  const denominator = Math.cos(latRad) * Math.sin(zenith);
  let azimuth: number;
  if (Math.abs(denominator) < 1e-9) {
    azimuth = 0;
  } else {
    const cosAzimuth = clamp(
      (Math.sin(latRad) * Math.cos(zenith) - Math.sin(decRad)) / denominator,
      -1,
      1,
    );
    const azimuthFromSouth = Math.acos(cosAzimuth) * RAD_TO_DEG;
    azimuth =
      hourAngle > 0
        ? normalizeDegrees(azimuthFromSouth + 180)
        : normalizeDegrees(540 - azimuthFromSouth);
  }

  return { azimuth, elevation, declination, equationOfTime };
}

/**
 * Hour angle (degrees) at which the sun reaches `elevation`, or `null` when the
 * sun never reaches that elevation on this day (polar day/night).
 */
function hourAngleForElevation(
  latitude: number,
  declination: number,
  elevation: number,
): number | null {
  const latRad = latitude * DEG_TO_RAD;
  const decRad = declination * DEG_TO_RAD;
  const cosLat = Math.cos(latRad);
  const cosDec = Math.cos(decRad);
  if (Math.abs(cosLat) < 1e-9 || Math.abs(cosDec) < 1e-9) return null;

  const cosHourAngle =
    (Math.cos((90 - elevation) * DEG_TO_RAD) -
      Math.sin(latRad) * Math.sin(decRad)) /
    (cosLat * cosDec);

  if (cosHourAngle < -1 || cosHourAngle > 1) return null;
  return Math.acos(cosHourAngle) * RAD_TO_DEG;
}

/** Calendar date (`YYYY-MM-DD`) of an instant in a given IANA time zone. */
export function dateKeyInZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function solarNoonForUtcDay(anchor: Date, longitude: number): Date {
  const { equationOfTime } = solarParams(toJulianDay(anchor));
  const minutes = 720 - 4 * longitude - equationOfTime;
  const midnightUtc = Date.UTC(
    anchor.getUTCFullYear(),
    anchor.getUTCMonth(),
    anchor.getUTCDate(),
  );
  return new Date(midnightUtc + minutes * MS_PER_MINUTE);
}

/**
 * Sunrise, sunset, twilight and golden/blue hour times for the solar day that
 * matches `date`'s calendar date in `timeZone`.
 */
export function getSunTimes(
  date: Date,
  latitude: number,
  longitude: number,
  timeZone = "UTC",
): SunTimes {
  const targetKey = dateKeyInZone(date, timeZone);
  let anchor = new Date(`${targetKey}T12:00:00Z`);
  let solarNoon = solarNoonForUtcDay(anchor, longitude);

  const noonKey = dateKeyInZone(solarNoon, timeZone);
  if (noonKey < targetKey) {
    anchor = new Date(anchor.getTime() + MS_PER_DAY);
    solarNoon = solarNoonForUtcDay(anchor, longitude);
  } else if (noonKey > targetKey) {
    anchor = new Date(anchor.getTime() - MS_PER_DAY);
    solarNoon = solarNoonForUtcDay(anchor, longitude);
  }

  const { declination } = solarParams(toJulianDay(anchor));

  const at = (elevation: number, evening: boolean): Date | null => {
    const hourAngle = hourAngleForElevation(latitude, declination, elevation);
    if (hourAngle === null) return null;
    const offsetMinutes = hourAngle * 4 * (evening ? 1 : -1);
    return new Date(solarNoon.getTime() + offsetMinutes * MS_PER_MINUTE);
  };

  const sunrise = at(SUNRISE_ELEVATION, false);
  const sunset = at(SUNRISE_ELEVATION, true);

  let polarState: PolarState = "normal";
  if (sunrise === null || sunset === null) {
    polarState =
      getSunPosition(solarNoon, latitude, longitude).elevation > 0
        ? "polar-day"
        : "polar-night";
  }

  return {
    solarNoon,
    sunrise,
    sunset,
    dayLengthMinutes:
      sunrise && sunset
        ? (sunset.getTime() - sunrise.getTime()) / MS_PER_MINUTE
        : null,
    civilDawn: at(-6, false),
    civilDusk: at(-6, true),
    nauticalDawn: at(-12, false),
    nauticalDusk: at(-12, true),
    astronomicalDawn: at(-18, false),
    astronomicalDusk: at(-18, true),
    goldenHourMorningStart: sunrise,
    goldenHourMorningEnd: at(6, false),
    goldenHourEveningStart: at(6, true),
    goldenHourEveningEnd: sunset,
    blueHourMorningStart: at(-6, false),
    blueHourMorningEnd: at(-4, false),
    blueHourEveningStart: at(-4, true),
    blueHourEveningEnd: at(-6, true),
    polarState,
  };
}

/** Offset in milliseconds between a time zone's wall clock and UTC. */
export function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - date.getTime();
}

/** Convert a wall-clock date/time in `timeZone` to an absolute instant. */
export function zonedTimeToUtc(
  dateKey: string,
  timeKey: string,
  timeZone: string,
): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute] = timeKey.split(":").map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);

  let timestamp = utcGuess - getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  timestamp = utcGuess - getTimeZoneOffsetMs(new Date(timestamp), timeZone);
  return new Date(timestamp);
}
