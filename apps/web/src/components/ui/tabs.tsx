import { Tabs as TabsPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

export const Tabs = TabsPrimitive.Root;

/** Shared look for in-page tabs and route tabs (`PageTabs`). */
export const tabsListClass = 'inline-flex items-center gap-1 rounded-full bg-muted p-1';
export const tabsTriggerClass = cn(
  'inline-flex h-10 items-center gap-2 rounded-full px-4 text-[15px] font-semibold whitespace-nowrap text-muted-foreground outline-none transition-colors',
  'hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-primary-soft focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50',
);
export const tabsTriggerActiveClass = 'bg-card text-primary shadow-card';

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List data-slot="tabs-list" className={cn(tabsListClass, className)} {...props} />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        tabsTriggerClass,
        'data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-card',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn('outline-none', className)}
      {...props}
    />
  );
}
