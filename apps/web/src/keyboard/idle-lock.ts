// Auto-lock after `auto_lock_minutes` without keyboard or mouse activity (docs/design.md 5).

export const ACTIVITY_EVENTS = [
  'mousedown',
  'mousemove',
  'keydown',
  'wheel',
  'touchstart',
] as const;
export const IDLE_CHECK_MS = 15_000;

/**
 * Watches activity events on `target` and calls `onIdle` once the idle time reaches
 * `minutes()` (read on every check, so a changed setting applies at once). Fires once per idle
 * period. Returns a function that stops watching.
 */
export function startIdleLock({
  target,
  minutes,
  onIdle,
}: {
  target: EventTarget;
  minutes: () => number;
  onIdle: () => void;
}): () => void {
  let lastActivity = Date.now();
  let fired = false;
  const touch = () => {
    lastActivity = Date.now();
    fired = false;
  };
  for (const name of ACTIVITY_EVENTS) target.addEventListener(name, touch, { passive: true });
  const timer = setInterval(() => {
    if (!fired && Date.now() - lastActivity >= minutes() * 60_000) {
      fired = true;
      onIdle();
    }
  }, IDLE_CHECK_MS);
  return () => {
    clearInterval(timer);
    for (const name of ACTIVITY_EVENTS) target.removeEventListener(name, touch);
  };
}
