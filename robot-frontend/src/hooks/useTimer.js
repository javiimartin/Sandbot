import { useEffect, useState } from "react";

/**
 * useTimer
 * Returns elapsed seconds since the hook was first mounted.
 * Increments every second via setInterval.
 */
export function useTimer() {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return elapsed;
}

/**
 * formatTime
 * Converts a number of seconds into a MM:SS string.
 * @param {number} seconds
 * @returns {string}
 */
export function formatTime(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}