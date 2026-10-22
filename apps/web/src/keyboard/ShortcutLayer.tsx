import { createContext, type ReactNode, useContext, useEffect, useRef } from 'react';
import { Outlet, useNavigate } from 'react-router';
import { api } from '../api/endpoints';
import { ApprovalProvider } from '../approval/ApprovalProvider';
import { useAuth } from '../auth/AuthProvider';
import { matchShortcut } from './shortcuts';

const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'wheel', 'touchstart'] as const;
const IDLE_CHECK_MS = 15_000;

/** Locks the screen after `auto_lock_minutes` without keyboard or mouse activity. */
function useIdleLock(lock: () => Promise<void>): void {
  useEffect(() => {
    let minutes = 5;
    let lastActivity = Date.now();
    let current = true;
    api
      .settings()
      .then((r) => {
        if (current) minutes = r.settings.autoLockMinutes;
      })
      .catch(() => undefined);
    const touch = () => {
      lastActivity = Date.now();
    };
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, touch, { passive: true });
    const timer = setInterval(() => {
      if (Date.now() - lastActivity >= minutes * 60_000) void lock();
    }, IDLE_CHECK_MS);
    return () => {
      current = false;
      clearInterval(timer);
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, touch);
    };
  }, [lock]);
}

type Handler = () => void;

interface Handlers {
  pay?: Handler;
  hold?: Handler;
}

const HandlersContext = createContext<{ current: Handlers } | null>(null);

/** Focuses the page's main search box (`data-search-input`); on other pages, opens Kasir. */
function focusSearch(navigate: (path: string) => void): void {
  const input = document.querySelector<HTMLInputElement>('[data-search-input]');
  if (input) {
    input.focus();
    input.select();
  } else {
    navigate('/kasir');
  }
}

/**
 * Global keys for every logged-in page (F-keys, Ctrl+L) and the idle auto-lock.
 * Kasir registers Bayar and Tahan.
 */
export function ShortcutLayer({ children }: { children?: ReactNode }) {
  const navigate = useNavigate();
  const { lock } = useAuth();
  const handlers = useRef<Handlers>({});
  useIdleLock(lock);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const { capture, action } = matchShortcut(event);
      if (!capture) return;
      event.preventDefault();
      if (!action) return;
      if (action.kind === 'navigate') navigate(action.path);
      else if (action.kind === 'search') focusSearch(navigate);
      else if (action.kind === 'lock') void lock();
      else handlers.current[action.kind]?.();
    }
    // Capture phase: runs before inputs and dialogs can swallow the key.
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [navigate, lock]);

  return (
    <HandlersContext.Provider value={handlers}>
      <ApprovalProvider>{children ?? <Outlet />}</ApprovalProvider>
    </HandlersContext.Provider>
  );
}

/** Registers the page's handlers for F8 (Bayar) and F9 (Tahan) while it is mounted. */
export function useShortcutHandlers(next: Handlers): void {
  const handlers = useContext(HandlersContext);
  // Always call the latest closures without re-registering.
  const latest = useRef(next);
  latest.current = next;
  useEffect(() => {
    if (!handlers) return;
    handlers.current = {
      pay: () => latest.current.pay?.(),
      hold: () => latest.current.hold?.(),
    };
    return () => {
      handlers.current = {};
    };
  }, [handlers]);
}
