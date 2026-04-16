# UI and Theming Rules

## Styling Approach

Tailwind CSS 4 with CSS variable tokens. No CSS-in-JS. No CSS modules.

Inline `style={{}}` is allowed **only** for truly dynamic computed values that cannot be expressed as Tailwind classes (e.g., `width: \`${percentage}%\``, runtime-computed `backgroundColor` from a token variable). All static visual properties must use Tailwind utility classes referencing CSS variable tokens.

---

## Design Token System

All visual tokens live in `src/ui/theme/tokens.css` as CSS custom properties. This is the single file replaced during a reskin.

### Token Categories

```css
:root {
  /* Surface colors */
  --color-bg-primary: ...;
  --color-bg-secondary: ...;
  --color-bg-surface: ...;
  --color-bg-overlay: ...;

  /* Text colors */
  --color-text-primary: ...;
  --color-text-secondary: ...;
  --color-text-muted: ...;

  /* Accent / brand */
  --color-accent: ...;
  --color-accent-hover: ...;

  /* Game-specific */
  --color-hp-high: ...;
  --color-hp-medium: ...;
  --color-hp-low: ...;
  --color-zone-head: ...;
  --color-zone-chest: ...;
  --color-zone-legs: ...;

  /* Status */
  --color-success: ...;
  --color-warning: ...;
  --color-error: ...;
  --color-info: ...;

  /* Spacing scale */
  --space-xs: 0.25rem;
  --space-sm: 0.5rem;
  --space-md: 1rem;
  --space-lg: 1.5rem;
  --space-xl: 2rem;

  /* Typography */
  --font-primary: 'Inter', sans-serif;
  --font-display: 'Orbitron', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  /* Border radius */
  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 1rem;

  /* Animation */
  --duration-fast: 150ms;
  --duration-normal: 300ms;
  --duration-slow: 500ms;
}
```

### Rules

- All colors referenced via CSS variables, never hardcoded hex/rgb in component classes
- Tailwind classes reference tokens: `bg-[var(--color-bg-primary)]` or via `@theme` mapping
- When Tailwind 4 `@theme` maps a token to a utility, use the utility: `bg-primary` not `bg-[var(...)]`
- No `dark:` variant classes — dark theme is the default and only theme (game aesthetic)
- Font stacks reference token variables; no font imports outside `ui/theme/fonts.css`

---

## UI Component Rules

### Location and Responsibility

UI primitives live in `src/ui/components/`. They are:

- **Stateless**: no Zustand, no TanStack Query, no transport imports
- **Composable**: accept children, forward refs, spread props
- **Theme-driven**: all visual styling via Tailwind classes referencing CSS variable tokens
- **Accessible**: use Radix UI primitives for interactive components (Dialog, Tooltip, Tabs, etc.)

### Naming

| Component | File | Notes |
|-----------|------|-------|
| Button | `ui/components/Button.tsx` | Variants: primary, secondary, ghost, danger |
| TextInput | `ui/components/TextInput.tsx` | With label, error state |
| Card | `ui/components/Card.tsx` | Surface container |
| Dialog | `ui/components/Dialog.tsx` | Wraps Radix Dialog |
| Badge | `ui/components/Badge.tsx` | Status indicators |
| ProgressBar | `ui/components/ProgressBar.tsx` | HP bars, XP bars |
| Timer | `ui/components/Timer.tsx` | Turn countdown |
| Spinner | `ui/components/Spinner.tsx` | Loading state |
| ConnectionIndicator | `ui/components/ConnectionIndicator.tsx` | SignalR status dot |
| Avatar | `ui/components/Avatar.tsx` | Player avatar placeholder |
| Tooltip | `ui/components/Tooltip.tsx` | Wraps Radix Tooltip |

### Rules

- UI components accept only props — no hooks that read global state
- Use `clsx` + `tailwind-merge` for conditional class composition
- No `React.FC` — use plain function declarations with typed props
- Forward `className` prop for composition: consumer can add layout classes
- No default exports — named exports only
- Do not re-export shadcn/ui components from `design/` into `src/ui/` — the `design/` directory is a reference/design-system playground, not a runtime dependency

---

## Feature Component Rules

Feature components live in `modules/{module}/components/`. They:

- May read from their own module's Zustand store
- May use TanStack Query hooks for data fetching
- May use UI primitives from `ui/components/`
- Must NOT directly call `transport/` functions — use hooks
- Must NOT read from other modules' stores directly (use shared hooks or props)

---

## Screen Rules

Screens live in `modules/{module}/screens/`. They:

- Compose feature components and UI primitives into a full page
- Are referenced by `app/router.tsx` route definitions
- May coordinate multiple hooks from their module
- Must NOT contain inline business logic — delegate to store actions
- Are lazy-loaded via `React.lazy()` for code splitting

---

## Animation Rules

- Framer Motion for battle animations and page transitions
- CSS transitions for hover/focus/active states (via Tailwind)
- No animation on first render unless explicitly desired (battle intro)
- Respect `prefers-reduced-motion` media query
- Battle animations must not block state updates — visual-only overlay on top of mechanical state

---

## Responsive Design

- Mobile-first approach: base styles for mobile, `md:` and `lg:` breakpoints for desktop
- Battle screen is the primary desktop experience — minimum viewport width documented
- Chat panel collapses to sheet/drawer on mobile
- No separate mobile/desktop component trees — responsive via Tailwind breakpoints

---

## Forbidden UI Patterns

| Pattern | Why |
|--------|-----|
| Hardcoded color values in classes | Use CSS variable tokens |
| CSS modules or styled-components | Tailwind + CSS variables only |
| `ui/` components importing stores | UI primitives must be stateless |
| Inline styles for static values (`style={{ color: 'red' }}`) | Use Tailwind classes; `style` only for dynamic computed values |
| Direct shadcn/ui imports from `design/` at runtime | `design/` is reference only |
| `useEffect` for data fetching | TanStack Query for HTTP, hooks for SignalR |
| `React.FC` type annotation | Plain function with typed props |
| Default exports | Named exports only |
| `any` type assertions | Typed props and generics |
