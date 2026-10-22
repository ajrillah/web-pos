import type { ReactNode } from 'react';

/** Page title row; blends with the background (no bar). */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex items-end justify-between gap-6 pb-6">
      <div className="space-y-1">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em]">{title}</h1>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
    </header>
  );
}
