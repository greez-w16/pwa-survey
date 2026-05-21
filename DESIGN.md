# QIMS DESIGN.md

## 1. Visual Theme & Atmosphere

QIMS should feel like a modern healthcare quality command center: calm, precise, trustworthy, and action-oriented. Use clean white surfaces over a cool blue-gray background, with deep navy navigation, emerald success signals, amber attention states, and red only for real risk.

Design mood: enterprise healthcare, data-rich but not cluttered, highly readable, touch-friendly, and resilient for low-bandwidth/field use.

## 2. Color Palette & Roles

| Token | Hex | Role |
| --- | --- | --- |
| `--qims-ink` | `#0f172a` | Primary text, strong headings |
| `--qims-muted` | `#64748b` | Secondary text and metadata |
| `--qims-canvas` | `#eef4fb` | App background |
| `--qims-surface` | `#ffffff` | Cards, forms, panels |
| `--qims-surface-soft` | `#f8fafc` | Subtle card/table backgrounds |
| `--qims-border` | `#dbe5f0` | Dividers and card borders |
| `--qims-navy` | `#0b1f3a` | Header/sidebar foundation |
| `--qims-blue` | `#2563eb` | Primary actions and active UI |
| `--qims-sky` | `#38bdf8` | Highlights and secondary accent |
| `--qims-emerald` | `#10b981` | Success, synced, completed |
| `--qims-amber` | `#f59e0b` | Warning, pending, partial |
| `--qims-red` | `#ef4444` | Error, critical, failed |

## 3. Typography Rules

Use the system UI stack for reliability. Prefer short, high-signal labels. Headings should be bold, compact, and clear. Body text should be 14–16px with generous line-height.

- Page titles: 28–36px, 800 weight, tight spacing
- Section headings: 18–22px, 750 weight
- Card labels: 11–12px uppercase, letter-spaced, muted
- Metrics: 22–32px, 800 weight
- Tables: 12–14px, never below 11px on screen

## 4. Component Styling

### Buttons

Primary buttons use blue gradients or solid `--qims-blue`, white text, rounded 10–12px corners, and visible focus rings. Secondary buttons use white/soft surfaces with blue or slate borders.

### Cards

Cards use white surfaces, 16–24px radius, soft shadow, subtle border, and generous padding. Important cards may include a colored top/bottom accent bar.

### Tables

Tables should remain readable: sticky/strong identifiers, muted zeros, pill badges, zebra rows, grouped headers, and horizontal scrolling on mobile. Do not squeeze dense report tables into tiny columns.

### Forms

Inputs should have 10–12px radius, clear labels, high-contrast text, and consistent focus rings. Multi-select and dialog flows should remain compact and touch-friendly.

### Status Badges

Use rounded pills. Green means complete/synced/on track; amber means pending/partial/warning; red means failed/critical. Avoid red unless the user must act.

## 5. Layout Principles

Use a responsive shell with a stable header, optional sidebar, and scrollable content area. Prefer max-width content containers for dashboard pages and full-width scroll areas for report tables/charts.

Spacing scale: 4, 8, 12, 16, 20, 24, 32, 48px.

## 6. Depth & Elevation

Use subtle elevation instead of heavy borders:

- Level 1 card: `0 10px 30px rgba(15,23,42,.08)`
- Level 2 floating panel: `0 18px 50px rgba(15,23,42,.16)`
- Header/nav: dark surface plus thin translucent border

## 7. Do's and Don'ts

Do:
- Keep workflows familiar and unchanged
- Prefer calm blues and healthcare greens
- Make state changes visible
- Preserve high contrast and accessibility
- Optimize for tablets and mobile field use

Don't:
- Add new dependencies for visual polish only
- Hide important data behind hover-only interactions
- Overuse gradients or red states
- Reduce table text below readable size
- Break PDF/print styling with screen-only changes

## 8. Responsive Behavior

Breakpoints:

- `< 640px`: stack header content, cards, and filters; use horizontal scroll for dense tables
- `640–1024px`: two-column cards, collapsible navigation
- `> 1024px`: full dashboard grid and sidebar navigation

Touch targets should be at least 40px high. All scroll containers should support momentum scrolling on mobile.

## 9. Agent Prompt Guide

When improving QIMS UI, use: modern healthcare command center, navy shell, white cards, blue action accents, emerald completion states, amber warnings, restrained red risk states, rounded cards, clear metrics, readable tables, and mobile-first scroll behavior.
