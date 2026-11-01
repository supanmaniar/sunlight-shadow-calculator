"use client";

import { useCallback, useRef } from "react";

type CompassProps = {
  /** Camera bearing in degrees, 0 = looking north. */
  bearing: number;
  /** Camera pitch in degrees, 0 = straight down. */
  pitch: number;
  /** Sun azimuth in degrees, used to draw the sun marker on the dial. */
  sunAzimuth: number;
  onChange: (bearing: number) => void;
  onPitchChange: (pitch: number) => void;
};

const SIZE = 84;
const CENTER = SIZE / 2;
const RADIUS = 32;

function polar(angleDeg: number, radius: number) {
  // Screen y grows downward, so north (0°) points up.
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: CENTER + radius * Math.cos(rad),
    y: CENTER + radius * Math.sin(rad),
  };
}

export function Compass({
  bearing,
  pitch,
  sunAzimuth,
  onChange,
  onPitchChange,
}: CompassProps) {
  const dialRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);

  const bearingFromPointer = useCallback((clientX: number, clientY: number) => {
    const element = dialRef.current;
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    if (Math.hypot(dx, dy) < 6) return null;
    // atan2 with y inverted so 0° is north and angles increase clockwise.
    const degrees = (Math.atan2(dx, -dy) * 180) / Math.PI;
    return (degrees + 360) % 360;
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const next = bearingFromPointer(event.clientX, event.clientY);
    if (next === null) return;
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    onChange(Math.round(next));
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const next = bearingFromPointer(event.clientX, event.clientY);
    if (next !== null) onChange(Math.round(next));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const sun = polar(sunAzimuth, RADIUS - 4);
  const view = polar(bearing, RADIUS - 10);

  return (
    <div className="flex items-center gap-3">
      <div
        ref={dialRef}
        role="slider"
        tabIndex={0}
        aria-label="Camera direction"
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={Math.round(bearing)}
        aria-valuetext={`${Math.round(bearing)} degrees`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            onChange((bearing - 15 + 360) % 360);
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            onChange((bearing + 15) % 360);
          }
        }}
        className="relative cursor-grab touch-none select-none rounded-full border border-stone-600 bg-stone-950/80 active:cursor-grabbing"
        style={{ width: SIZE, height: SIZE }}
      >
        <svg width={SIZE} height={SIZE} className="pointer-events-none">
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke="rgba(168,162,158,0.35)"
            strokeWidth={1}
          />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
            const inner = polar(angle, RADIUS - 4);
            const outer = polar(angle, RADIUS);
            return (
              <line
                key={angle}
                x1={inner.x}
                y1={inner.y}
                x2={outer.x}
                y2={outer.y}
                stroke="rgba(168,162,158,0.5)"
                strokeWidth={angle % 90 === 0 ? 1.6 : 1}
              />
            );
          })}
          {/* Sun direction */}
          <circle cx={sun.x} cy={sun.y} r={3.2} fill="#fbbf24" />
          {/* Camera view direction */}
          <line
            x1={CENTER}
            y1={CENTER}
            x2={view.x}
            y2={view.y}
            stroke="#f59e0b"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          <circle cx={CENTER} cy={CENTER} r={2.5} fill="#f59e0b" />
        </svg>
        <span className="pointer-events-none absolute inset-x-0 top-0.5 text-center text-[9px] font-semibold text-stone-400">
          N
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs text-stone-300">
          {Math.round(bearing)}°
        </span>
        <label className="flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-stone-500">
            Tilt
          </span>
          <input
            type="range"
            min={0}
            max={85}
            value={pitch}
            onChange={(event) => onPitchChange(Number(event.target.value))}
            className="w-16 accent-amber-500"
            aria-label="Camera tilt"
          />
        </label>
      </div>
    </div>
  );
}
