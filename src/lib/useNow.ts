"use client";

import { useSyncExternalStore } from "react";

const TICK_MS = 30_000;

/** Fixed instant used for the prerendered shell so the build stays deterministic. */
const SERVER_SNAPSHOT = Date.UTC(2024, 5, 21, 12, 0, 0);

let current = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (timer === null) {
    current = Date.now();
    timer = setInterval(() => {
      current = Date.now();
      listeners.forEach((notify) => notify());
    }, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot() {
  return current;
}

function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}

/** Current time in epoch milliseconds, refreshed every 30 seconds. */
export function useNowMs(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
