import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDLE_CHECK_MS, startIdleLock } from './idle-lock';

const MINUTE = 60_000;

describe('startIdleLock', () => {
  let target: EventTarget;
  let onIdle: ReturnType<typeof vi.fn<() => void>>;
  let stop: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    target = new EventTarget();
    onIdle = vi.fn<() => void>();
    stop = startIdleLock({ target, minutes: () => 5, onIdle });
  });

  afterEach(() => {
    stop();
    vi.useRealTimers();
  });

  it('locks after the configured idle minutes, not before', () => {
    vi.advanceTimersByTime(5 * MINUTE - IDLE_CHECK_MS);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(IDLE_CHECK_MS);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('restarts the countdown on keyboard or mouse activity', () => {
    vi.advanceTimersByTime(4 * MINUTE);
    target.dispatchEvent(new Event('keydown'));
    vi.advanceTimersByTime(4 * MINUTE);
    target.dispatchEvent(new Event('mousemove'));
    vi.advanceTimersByTime(4 * MINUTE);
    expect(onIdle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(MINUTE + IDLE_CHECK_MS);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('fires once per idle period', () => {
    vi.advanceTimersByTime(20 * MINUTE);
    expect(onIdle).toHaveBeenCalledTimes(1);
    target.dispatchEvent(new Event('mousedown'));
    vi.advanceTimersByTime(5 * MINUTE);
    expect(onIdle).toHaveBeenCalledTimes(2);
  });

  it('stops watching when stopped', () => {
    stop();
    vi.advanceTimersByTime(30 * MINUTE);
    expect(onIdle).not.toHaveBeenCalled();
  });

  it('reads the setting on every check', () => {
    stop();
    let minutes = 10;
    stop = startIdleLock({ target, minutes: () => minutes, onIdle });
    vi.advanceTimersByTime(2 * MINUTE);
    minutes = 1;
    vi.advanceTimersByTime(IDLE_CHECK_MS);
    expect(onIdle).toHaveBeenCalledTimes(1);
  });
});
