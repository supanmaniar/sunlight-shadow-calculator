"use client";

import { useMemo } from "react";

import { lightPhaseFor, type LightPhase } from "@/lib/lightPhase";
import type { SunPosition } from "@/lib/sun";

type PhaseBarProps = {
  /** Sun position at a given instant. */
  positionAt: (date: Date) => SunPosition;
  /** Local midnight of the displayed day, as a UTC instant. */
  dayStart: Date;
  /** Current time of day in minutes from local midnight. */
  minutes: number;
  onScrub: (minutes: number) => void;
};

const PHASE_COLOR: Record<LightPhase, string> = {
  night: "#0b1220",
  astronomical: "#1e1b4b",
  nautical: "#1e3a8a",
  blue: "#1d4ed8",
  civil: "#c2410c",
  golden: "#f59e0b",
  day: "#fde68a",
};

const SAMPLES = 96;

/**
 * A full-day strip coloured by light phase, with a marker at the current time.
 *
 * The point is to answer "where am I in the day?" without reading numbers: the
 * dark ends are night, the amber bands are golden hour, and the pale middle is
 * daylight. Clicking or dragging scrubs the time.
 */
export function PhaseBar({ positionAt, dayStart, minutes, onScrub }: PhaseBarProps) {
  const bands = useMemo(() => {
    const out: { phase: LightPhase; start: number; end: number }[] = [];
    for (let i = 0; i < SAMPLES; i += 1) {
      const from = (i / SAMPLES) * 1440;
      const to = ((i + 1) / SAMPLES) * 1440;
      const instant = new Date(dayStart.getTime() + (from + 0.5) * 60_000);
      const phase = lightPhaseFor(positionAt(instant).elevation).phase;
      const last = out[out.length - 1];
      if (last && last.phase === phase) last.end = to;
      else out.push({ phase, start: from, end: to });
    }
    return out;
  }, [positionAt, dayStart]);

  const scrubFrom = (clientX: number, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    onScrub(Math.round(ratio * 1439));
  };

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label="Time of day by light phase"
      aria-valuemin={0}
      aria-valuemax={1439}
      aria-valuenow={minutes}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        scrubFrom(event.clientX, event.currentTarget);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          scrubFrom(event.clientX, event.currentTarget);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          onScrub(Math.max(0, minutes - 10));
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          onScrub(Math.min(1439, minutes + 10));
        }
      }}
      className="relative h-3 w-full cursor-pointer touch-none overflow-hidden rounded-full ring-1 ring-inset ring-stone-700"
    >
      {bands.map((band) => (
        <div
          key={`${band.phase}-${band.start}`}
          className="absolute inset-y-0"
          style={{
            left: `${(band.start / 1440) * 100}%`,
            width: `${((band.end - band.start) / 1440) * 100}%`,
            backgroundColor: PHASE_COLOR[band.phase],
          }}
        />
      ))}
      <div
        className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_4px_rgba(0,0,0,0.8)]"
        style={{ left: `${(minutes / 1440) * 100}%` }}
      />
    </div>
  );
}
