import { NavLink } from 'react-router';
import { PinHint } from '../components/PinHint';
import { tabsListClass, tabsTriggerActiveClass, tabsTriggerClass } from '../components/ui/tabs';
import { cn } from '../lib/utils';
import type { MenuItem } from '../navigation/menu';

/** Sub-page tabs above the content; each tab is a route link styled like `Tabs`. */
export function PageTabs({ items, label }: { items: MenuItem[]; label: string }) {
  return (
    <nav aria-label={label} className={cn(tabsListClass, 'mb-6')}>
      {items.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) => cn(tabsTriggerClass, isActive && tabsTriggerActiveClass)}
        >
          {item.label}
          {item.requiresOwnerPin && <PinHint />}
        </NavLink>
      ))}
    </nav>
  );
}
