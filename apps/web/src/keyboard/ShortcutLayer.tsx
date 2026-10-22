import { createContext, type ReactNode, useContext, useEffect, useRef } from 'react';
import { Outlet, useNavigate } from 'react-router';
import { matchShortcut } from './shortcuts';

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

/** Global F-key handling for every logged-in page. Kasir registers Bayar and Tahan. */
export function ShortcutLayer({ children }: { children?: ReactNode }) {
  const navigate = useNavigate();
  const handlers = useRef<Handlers>({});

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const { capture, action } = matchShortcut(event);
      if (!capture) return;
      event.preventDefault();
      if (!action) return;
      if (action.kind === 'navigate') navigate(action.path);
      else if (action.kind === 'search') focusSearch(navigate);
      else handlers.current[action.kind]?.();
    }
    // Capture phase: runs before inputs and dialogs can swallow the key.
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [navigate]);

  return (
    <HandlersContext.Provider value={handlers}>{children ?? <Outlet />}</HandlersContext.Provider>
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
