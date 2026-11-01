"use client";

import { useState } from "react";

import type { SavedLocation } from "@/lib/savedLocations";

type SavedLocationsProps = {
  locations: SavedLocation[];
  onSave: (name: string) => void;
  onOpen: (location: SavedLocation) => void;
  onDelete: (id: string) => void;
  /** Suggested name, e.g. the current place or coordinates. */
  suggestion: string;
};

export function SavedLocations({
  locations,
  onSave,
  onOpen,
  onDelete,
  suggestion,
}: SavedLocationsProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="whitespace-nowrap rounded-lg border border-stone-700 px-2 py-1 text-[11px] hover:border-amber-500 hover:text-amber-300 sm:px-2.5 sm:text-xs"
      >
        Saved{locations.length > 0 ? ` (${locations.length})` : ""}
      </button>

      {open && (
        <div className="absolute bottom-full right-0 z-20 mb-2 w-72 rounded-xl border border-stone-700 bg-stone-900/95 p-3 text-sm shadow-2xl backdrop-blur">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onSave(name.trim() || suggestion);
              setName("");
            }}
            className="flex gap-2"
          >
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={suggestion}
              aria-label="Name for this location"
              className="min-w-0 flex-1 rounded-lg border border-stone-700 bg-stone-950 px-2 py-1.5 text-xs outline-none placeholder:text-stone-500 focus:border-amber-500"
            />
            <button
              type="submit"
              className="shrink-0 rounded-lg bg-amber-500 px-2.5 py-1.5 text-xs font-medium text-stone-950 hover:bg-amber-400"
            >
              Save
            </button>
          </form>

          {locations.length === 0 ? (
            <p className="mt-3 text-xs text-stone-500">
              No saved locations yet. Save the current view to come back to it
              later — the camera angle and time are kept too.
            </p>
          ) : (
            <ul className="mt-3 max-h-56 space-y-1 overflow-auto">
              {locations.map((location) => (
                <li key={location.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      onOpen(location);
                      setOpen(false);
                    }}
                    className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left hover:bg-stone-800"
                  >
                    <span className="block truncate text-xs font-medium">
                      {location.name}
                    </span>
                    <span className="block truncate font-mono text-[10px] text-stone-500">
                      {location.state.lat.toFixed(4)}, {location.state.lng.toFixed(4)}
                      {" · "}
                      {location.state.date}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(location.id)}
                    aria-label={`Delete ${location.name}`}
                    className="shrink-0 rounded px-1.5 py-1 text-xs text-stone-500 hover:text-red-400"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-2 border-t border-stone-800 pt-2 text-[10px] text-stone-500">
            Stored in this browser only. Nothing is uploaded.
          </p>
        </div>
      )}
    </div>
  );
}
