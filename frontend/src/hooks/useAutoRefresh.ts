import { useEffect, useRef } from "react";

/**
 * Calls `callback` every `intervalMs` while the tab is visible,
 * and again when the user returns to the tab/window.
 */
export function useAutoRefresh(callback: () => void | Promise<void>, intervalMs = 30000) {
  const cbRef = useRef(callback);
  const lastRun = useRef(Date.now());

  // Always call the latest version of the callback (avoids stale state)
  useEffect(() => { cbRef.current = callback; });

  useEffect(() => {
    const run = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastRun.current < 2000) return; // avoid double-fires
      lastRun.current = Date.now();
      cbRef.current();
    };

    const id = setInterval(run, intervalMs);
    document.addEventListener("visibilitychange", run);
    window.addEventListener("focus", run);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", run);
      window.removeEventListener("focus", run);
    };
  }, [intervalMs]);
}