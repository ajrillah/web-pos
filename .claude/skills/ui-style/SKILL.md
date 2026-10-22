---
name: ui-style
description: Visual design system ("Teal Elegan"): color tokens and their meanings, fonts, radius, shadow, shadcn/ui components, and the locked page layouts. Use when styling or laying out anything in apps/web.
paths:
  - apps/web/**
---

# UI style

Full rules: `docs/ui-style.md`. Read it before building a new page or component.

## Colors
- Use tokens only (`bg-primary`, `text-muted-foreground`, `border-border`, `bg-selected`, ...). Never raw hex or Tailwind palette colors (`slate-*`, `red-*`).
- Meanings are exclusive:
  - Teal = primary action, focus, active nav, key labels.
  - Green (`success`) = paid / change.
  - Red (`destructive`) = void / cancel / negative / error.
  - Gold (`warning`) = held / kasbon / warning / PIN hint.
- Text contrast >= 4.5:1. `faint` and gold `warning` are never text. `success` text is not used on `muted`.

## Type
- Plus Jakarta Sans for UI; JetBrains Mono (`font-mono`) for codes, TRX numbers, usernames, key hints.
- Bundled via `@fontsource-variable`; no CDN.
- `tabular-nums` on all money and quantities; money right-aligned.
- Body 15-16px. Table rows 17-18px. Cashier total 52px semibold, `tracking-[-0.03em]`. Labels use `.label-caps`.

## Shape
- `rounded-card` (24px) for cards and dialogs. `rounded-control` (18px) for inputs and buttons. `rounded-row` (14px) for rows. Pills are `rounded-full`.
- `shadow-card` only.
- Tables have no grid lines; rows are rounded hover/selected blocks. The header blends with the background.

## Components
- shadcn/ui lives in `src/components/ui/` (Radix via `radix-ui`, `cn()` from `src/lib/utils.ts`).
- Icons from `lucide-react`. Toasts from `sonner`. Data tables use TanStack Table.
- Add a component only when a feature needs it.
- One `default` (teal) button per view. `destructive` only for void, cancel, and deactivate.

## Layout (locked)
- Desktop only, min 1366x768.
- Kasir: full screen; right column 384px; Bayar button 72px.
- Other pages: 232px sidebar with 8 items; sub-pages as tabs; cashiers see "PIN" hints.
- Dialogs: centered; Enter confirms, Esc goes back.
