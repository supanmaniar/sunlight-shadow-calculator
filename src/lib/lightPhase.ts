/**
 * Light phases, defined by the sun's elevation above the horizon.
 *
 * These are the standard photographic definitions. The thresholds matter
 * because they are what photographers actually plan around: "golden hour" is
 * not a vibe, it is the window between the sun at 6° and the sun at -0.833°.
 */
export type LightPhase =
  | "night"
  | "astronomical"
  | "nautical"
  | "blue"
  | "civil"
  | "golden"
  | "day";

export type LightPhaseInfo = {
  phase: LightPhase;
  label: string;
  /** One-line explanation of what the light is doing. */
  description: string;
  /** True when the sun is above the horizon. */
  sunUp: boolean;
  /** 0 = full daylight, 1 = full night. Drives the scene's ambient light. */
  darkness: number;
  /** Colour of the atmospheric wash laid over the scene. */
  tint: string;
  /** Strength of that wash, 0..1. */
  tintOpacity: number;
};

type PhaseMeta = Omit<LightPhaseInfo, "phase" | "darkness">;

const PHASES: Record<LightPhase, PhaseMeta> = {
  day: {
    label: "Daylight",
    description: "Sun well above the horizon. Hard shadows, full colour.",
    sunUp: true,
    tint: "#ffffff",
    tintOpacity: 0,
  },
  golden: {
    label: "Golden hour",
    description: "Sun low and warm. Long shadows, soft light.",
    sunUp: true,
    tint: "#f0a35e",
    tintOpacity: 0.16,
  },
  civil: {
    label: "Civil twilight",
    description: "Sun just below the horizon. Colours still visible.",
    sunUp: false,
    tint: "#4a5a8c",
    tintOpacity: 0.34,
  },
  blue: {
    label: "Blue hour",
    description: "Deep blue sky. City lights start to matter.",
    sunUp: false,
    tint: "#1b2f63",
    tintOpacity: 0.52,
  },
  nautical: {
    label: "Nautical twilight",
    description: "Horizon still faintly visible at sea.",
    sunUp: false,
    tint: "#101c3a",
    tintOpacity: 0.68,
  },
  astronomical: {
    label: "Astronomical twilight",
    description: "Sky nearly black. Faint glow on the horizon.",
    sunUp: false,
    tint: "#080e1e",
    tintOpacity: 0.8,
  },
  night: {
    label: "Night",
    description: "Sun far below the horizon. Full darkness.",
    sunUp: false,
    tint: "#05080f",
    tintOpacity: 0.86,
  },
};

/**
 * Classify the light from the sun's elevation in degrees.
 *
 * Boundaries follow the standard twilight definitions:
 *   6° to 0°      golden hour
 *   0° to -4°     civil twilight
 *   -4° to -6°    blue hour
 *   -6° to -12°   nautical twilight
 *   -12° to -18°  astronomical twilight
 *   below -18°    night
 *
 * Each boundary belongs to the darker band, matching the standard definitions.
 */
export function lightPhaseFor(elevation: number): LightPhaseInfo {
  let phase: LightPhase;

  if (elevation >= 6) phase = "day";
  else if (elevation >= -0.833) phase = "golden";
  else if (elevation > -4) phase = "civil";
  else if (elevation > -6) phase = "blue";
  else if (elevation > -12) phase = "nautical";
  else if (elevation > -18) phase = "astronomical";
  else phase = "night";

  return {
    phase,
    ...PHASES[phase],
    darkness: darknessFor(elevation),
  };
}

/**
 * How dark the scene should be, from 0 (full day) to 1 (full night).
 *
 * Ramps across the whole twilight band rather than switching at a threshold,
 * so scrubbing the time slider produces a smooth transition instead of a jump.
 */
export function darknessFor(elevation: number): number {
  if (elevation >= 6) return 0;
  if (elevation <= -18) return 1;
  // 6° down to -18° maps to 0..1.
  return (6 - elevation) / 24;
}

/**
 * Warmth of the light, 0 = neutral daylight, 1 = deep sunset orange.
 *
 * Peaks at the horizon and fades out below it: once the sun is down there is no
 * warm light left to cast, so buildings must not stay sunset-tinted all night.
 */
export function warmthFor(elevation: number): number {
  if (elevation >= 20) return 0;
  if (elevation >= 0) return (20 - elevation) / 20;
  if (elevation <= -6) return 0;
  // Fade the last of the glow out across the blue hour.
  return 1 + elevation / 6;
}

/**
 * Atmospheric wash anchors, ordered from brightest to darkest.
 *
 * Interpolating between these (rather than switching colour at each phase
 * boundary) is what makes scrubbing the time slider look like a sunset instead
 * of a series of jumps.
 */
const TINT_ANCHORS: { elevation: number; color: string; opacity: number }[] = [
  { elevation: 20, color: "#ffffff", opacity: 0 },
  { elevation: 6, color: "#ffe9c9", opacity: 0.06 },
  { elevation: 0, color: "#f0a35e", opacity: 0.2 },
  { elevation: -4, color: "#4a5a8c", opacity: 0.36 },
  { elevation: -6, color: "#1b2f63", opacity: 0.52 },
  { elevation: -12, color: "#101c3a", opacity: 0.68 },
  { elevation: -18, color: "#080e1e", opacity: 0.8 },
  { elevation: -30, color: "#05080f", opacity: 0.86 },
];

function parseHex(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function toHex(rgb: [number, number, number]): string {
  return `#${rgb
    .map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Blend two hex colours. `t` of 0 returns `a`, 1 returns `b`. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  return toHex([
    pa[0] + (pb[0] - pa[0]) * t,
    pa[1] + (pb[1] - pa[1]) * t,
    pa[2] + (pb[2] - pa[2]) * t,
  ]);
}

/** Colour and strength of the atmospheric wash for a given sun elevation. */
export function tintFor(elevation: number): { color: string; opacity: number } {
  const first = TINT_ANCHORS[0];
  const last = TINT_ANCHORS[TINT_ANCHORS.length - 1];
  if (elevation >= first.elevation) {
    return { color: first.color, opacity: first.opacity };
  }
  if (elevation <= last.elevation) {
    return { color: last.color, opacity: last.opacity };
  }

  for (let i = 1; i < TINT_ANCHORS.length; i += 1) {
    const hi = TINT_ANCHORS[i - 1];
    const lo = TINT_ANCHORS[i];
    if (elevation <= hi.elevation && elevation >= lo.elevation) {
      const t = (hi.elevation - elevation) / (hi.elevation - lo.elevation);
      return {
        color: mixHex(hi.color, lo.color, t),
        opacity: hi.opacity + (lo.opacity - hi.opacity) * t,
      };
    }
  }

  return { color: last.color, opacity: last.opacity };
}
