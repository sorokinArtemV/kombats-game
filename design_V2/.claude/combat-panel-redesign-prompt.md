# Combat Panel Composition Redesign — Coding Agent Prompt

## Context

The combat panel (`BodyZoneSelector.tsx`) is the core turn UI for a turn-based fighting game (The Kombats). It's a diptych: left column = ATTACK (pick one zone on opponent), right column = BLOCK (pick one zone-pair on self). Both selections happen simultaneously within a 30-second turn timer.

The panel is functional but compositionally broken: two small silhouettes lost in an oversized dark rectangle with no visual rhythm, no hierarchy, and no sense that this is where combat decisions happen. This pass is **composition and layout only** — zone masks, hover logic, selection logic, glow rendering all stay untouched.

### Reference screenshots

- **Current state**: GameScreens screenshot — 640px panel, silhouettes at 160px width, ~270px dead gap, meta row poorly laid out, placeholder text indistinguishable from selected text, no panel title, no decorative elements, flat and lifeless.
- **Design reference**: Claude Design mockup — denser composition, center-axis timer, column subtitles with instructions, semantic corner accents, compact footer row with selection + CTA inline. This is a directional reference, NOT a spec to replicate 1:1.

---

## Required reading (view these files BEFORE writing any code)

```
git log --all --oneline -- src/app/components/BodyZoneSelector.tsx
src/design-system/tokens.ts
src/design-system/primitives/Panel.tsx
src/design-system/primitives/PanelHeader.tsx
src/design-system/primitives/Button.tsx
src/design-system/primitives/Label.tsx
src/design-system/primitives/Divider.tsx
src/design-system/composed/OnboardingCard.tsx   (TITLE_STYLE pattern for Cinzel headings)
src/design-system/composed/QueueCard.tsx         (glass Panel + centered CTA structure)
src/app/components/BodyZoneSelector.tsx           (current implementation — read ALL of it)
src/app/components/GameScreens.tsx                (call site — check width, padding, layout)
src/app/components/MockBattle.tsx                 (call site — check width differences)
```

Also check if `kunai.png` and `mitsudamoe.png` exist in the assets directory:
```
find src -name "kunai*" -o -name "mitsudamoe*" -o -name "*.png" | head -20
ls src/assets/ 2>/dev/null || ls public/assets/ 2>/dev/null || echo "No assets dir found"
```

---

## Fixes (implement in order)

### Fix 1 — Panel title row

**Rationale**: Without a title, the panel reads as two disconnected columns. Every other DS panel (OnboardingCard, QueueCard, ChatDock) has a title. The combat panel needs one.

Add a panel title row as the FIRST child inside the Panel, above the meta row.

```tsx
// Style constant — follows OnboardingCard TITLE_STYLE pattern but smaller/tighter
const PANEL_TITLE_STYLE: CSSProperties = {
  margin: 0,
  fontSize: 15,
  fontWeight: 600,
  letterSpacing: '0.24em',
  textTransform: 'uppercase',
  color: accent.primary,       // tokens.accent.primary = '#c9a25a'
  fontFamily: '"Cinzel","Trajan Pro","Noto Serif JP",serif',
  textShadow: '0 2px 12px rgba(201, 162, 90, 0.3)',
  textAlign: 'center',
  lineHeight: 1,
};
```

Text: `SELECT ATTACK & BLOCK`

Layout: centered in a row with `padding: ${space.sm} ${space.md}`, placed ABOVE the meta row (ROUND / timer / YOUR TURN). Add a `<Divider marginY="xs" />` between title and meta row.

### Fix 2 — Meta row: 3-column grid for stable centering

**Rationale**: Current `justify-between` floats the timer toward ROUND 2 on wide panels. Timer must be dead center.

Replace the meta row's flex layout with CSS grid:

```tsx
const META_ROW_STYLE: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto 1fr',
  alignItems: 'center',
  padding: `${space.xs} ${space.md}`,
};
```

- Left cell (ROUND 2): `textAlign: 'left'`
- Center cell (timer): `textAlign: 'center'`
- Right cell (YOUR TURN): `textAlign: 'right'`

**YOUR TURN badge redesign**: Replace the bordered-box badge with a simpler treatment:

```tsx
// Dot + label, left-aligned or right-aligned, no border box
const TURN_INDICATOR_STYLE: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: space.xs,
};
// Dot: 6px circle, background: accent.primary, with a subtle boxShadow glow
// Text: Label primitive with tone="accent"
```

### Fix 3 — Silhouette sizing and gap reduction

**Rationale**: Silhouettes at 160px in a 640px panel = ~270px dead gap. Silhouettes need to be bigger and closer.

- In GameScreens.tsx: change silhouette `width` prop from `160` to `210`.
- In BodyZoneSelector.tsx: change the gap between the two silhouette columns from `space.xl` (32px) to `space.md` (16px).
- **IMPORTANT**: All overlay/mask calculations in BodyZoneSelector already scale proportionally with the `width` prop. Do NOT introduce any fixed pixel values for overlays — they must continue using the width prop for sizing.

### Fix 4 — Column subtitles (instructional text under ATTACK / BLOCK headers)

**Rationale**: Single-word headers ("ATTACK", "BLOCK") give no instruction. New players won't know what to do.

Under each column header, add a subtitle:
- ATTACK column: `"PICK ONE ZONE ON YOUR FOE"`
- BLOCK column: `"ONE PAIR, TWO ZONES COVERED"`

```tsx
const COLUMN_SUBTITLE_STYLE: CSSProperties = {
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: text.muted,           // tokens.text.muted = 'rgba(232, 232, 240, 0.48)'
  marginTop: space.xs,         // 4px
  textAlign: 'center',
};
```

### Fix 5 — Placeholder vs. selected text states

**Rationale**: "Select zone" in white bold 16px reads as an actual selection. Placeholder must look empty.

Current constants to modify (VALUE_STYLE or equivalent in BodyZoneSelector):

**Placeholder state** (nothing selected):
```tsx
{
  fontSize: 14,
  color: text.muted,            // 0.48 opacity — clearly "empty"
  fontStyle: 'italic',
  fontWeight: 400,
  letterSpacing: '0.04em',
  textAlign: 'center',
}
```

**Selected state** (zone chosen):
```tsx
// Attack: color = semantic.attack.text (#d04654)
// Block:  color = semantic.block.text  (#6a9a8a)
{
  fontSize: 14,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  textAlign: 'center',
}
```

The rendering logic should check: if selection is null/empty → placeholder style + placeholder text ("Select zone" / "Select pair"). If selection exists → selected style + zone name(s) in semantic color.

### Fix 6 — Semantic corner accents

**Rationale**: The silhouette columns are surrounded by dead dark space. Small decorative corner marks in semantic tones visually claim each column's territory and add tactical flavor. This extends the existing parallelogram blade metaphor from the HP bars.

Add corner accent marks to each silhouette column:

- **ATTACK column**: top-left and bottom-left corners, `semantic.attack.base` (#c03744) at ~0.35 opacity
- **BLOCK column**: top-right and bottom-right corners, `semantic.block.base` (#5a8a7a) at ~0.35 opacity

Implementation: CSS pseudo-elements or small absolute-positioned divs. Each mark is a simple right-angle corner (two thin lines meeting at 90°):

```tsx
// Corner accent — e.g. top-left for Attack
const CORNER_SIZE = 14;  // px, length of each arm
const CORNER_THICKNESS = 1.5; // px

// Positioned absolutely within the silhouette column wrapper
// top-left: { top: 0, left: 0, borderTop + borderLeft }
// bottom-left: { bottom: 0, left: 0, borderBottom + borderLeft }
// etc.
```

The silhouette column wrapper needs `position: relative` (it may already have it for overlay positioning).

### Fix 7 — Compact footer row

**Rationale**: Current layout stacks selection labels + LOCK IN vertically, wasting vertical space. A single footer row is tighter and more decisive.

Redesign the area below the silhouettes as a single horizontal row:

```
[ ATTACK: Stomach    |    BLOCK: Chest & Stomach    |    [LOCK IN] ]
```

Layout:
```tsx
const FOOTER_ROW_STYLE: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr auto',
  alignItems: 'center',
  gap: space.md,
  padding: `${space.sm} ${space.md}`,
};
```

- Left cell: `<Label tone="attack">ATTACK</Label>` + selected zone name (or placeholder in muted)
- Center cell: `<Label tone="block">BLOCK</Label>` + selected pair name (or placeholder in muted)
- Right cell: `<Button variant="primary" size="md" disabled={!canLock}>LOCK IN</Button>`

Note: Button changes from `size="lg"` to `size="md"` to fit the inline layout. Remove the `<Divider>` that previously separated the summary from LOCK IN — the footer row replaces both elements.

### Fix 8 — LOCK IN disabled state fix

**Rationale**: DS `Button` primary disabled should render as filled gold with `opacity: 0.5`. If the current rendering shows an outlined/muted gold border instead, something is overriding the Button primitive's built-in disabled styling.

Check BodyZoneSelector for any `style` prop overrides on the `<Button>` element when `disabled` is true. The Button primitive already handles disabled via `opacity: disabled ? 0.5 : 1` and `cursor: 'not-allowed'`. Remove any style overrides that change background, border, or color when disabled.

If there IS no override and it still renders as outlined, check whether the call site is using `variant="secondary"` instead of `variant="primary"` for the disabled state. Fix: always use `variant="primary"` regardless of disabled state.

### Fix 9 — BLOCK header breathing room

**Rationale**: Cinzel 18px serif with text-shadow at the top of the column gets clipped. The column wrapper needs top padding.

Add `paddingTop: space.sm` (8px) to both silhouette column wrappers (not just BLOCK — keep them symmetrical).

---

## What stays unchanged (DO NOT TOUCH)

- **Zone mask rendering**: `renderZoneMask`, `getZoneMaskStyle`, feathered gradients, paired-mask logic — ALL mask/overlay functions stay exactly as they are.
- **Hover logic**: hover states, hover gap fix (adjacency feather extension), hover outline via SVG mask defs — untouched.
- **Selection logic**: click handlers, state management, zone selection/deselection — untouched.
- **Silhouette stage layers**: backdrop radial, tactical-grid dot pattern, base PNG, warm edge glow — untouched.
- **MockBattle.tsx**: do NOT change MockBattle's silhouette width (190px) or layout. Only change GameScreens.tsx layout.
- **Any file outside BodyZoneSelector.tsx and GameScreens.tsx**: no changes to tokens.ts, primitives, other composed components.

---

## Do NOT

- ❌ Introduce fixed pixel widths for overlays/masks that should scale with the `width` prop
- ❌ Add CSS animations or transitions beyond what already exists
- ❌ Change any color values — use ONLY tokens from `tokens.ts`
- ❌ Invent new visual vocabulary (no scan lines, no neon, no gradients that aren't already in the DS)
- ❌ Touch zone mask functions, hover logic, or selection state management
- ❌ Add new npm dependencies
- ❌ Modify tokens.ts or any primitive component
- ❌ Change the terminology (ATTACK/BLOCK stays, not STRIKE/GUARD)
- ❌ Apply inline style overrides to DS Button that contradict its built-in variant styles
- ❌ Remove or modify the silhouette PNG imports or their rendering
- ❌ Quietly fix things not listed in this prompt (if you notice other issues, note them in a comment at the end but don't fix them)

---

## Asset integration (optional, if files exist)

If `kunai.png` and `mitsudamoe.png` exist in the project assets:
- **kunai.png** (attack icon): can be used as a small (12-14px) inline icon next to the ATTACK label in the footer row, tinted with `semantic.attack.text` via CSS filter or as a mask-image
- **mitsudamoe.png** (block icon): same treatment next to BLOCK label, tinted with `semantic.block.text`
- These are OPTIONAL decorative touches — only add if the icons are already in the asset pipeline. Do NOT import external images or create new asset infrastructure.

---

## Deliverables

After implementation, capture screenshots of:

1. **Empty state** — panel loaded, no selections made. Verify: title visible, placeholder text is muted/italic, LOCK IN is filled gold at 50% opacity, corner accents visible, meta row centered, subtitles visible under ATTACK/BLOCK.
2. **Attack selected** — one attack zone selected (e.g., Stomach). Verify: left footer cell shows zone name in semantic.attack.text, right footer cell still shows muted placeholder, LOCK IN still disabled.
3. **Both selected** — attack + block both chosen. Verify: both footer cells show selections in semantic tones, LOCK IN is fully opaque and enabled.
4. **Full GameScreens view** — the panel in context with HP bars, fighter art, chat dock. Verify: panel doesn't overflow, silhouettes fill the space well without the old dead-gap problem.

---

## Verification checklist

- [ ] Panel has a Cinzel gold title "SELECT ATTACK & BLOCK" above the meta row
- [ ] Meta row uses 3-column grid; timer is dead-center regardless of left/right content width
- [ ] YOUR TURN is a dot+label, NOT a bordered box
- [ ] Silhouette width in GameScreens is 210px (up from 160px)
- [ ] Gap between silhouette columns is `space.md` (16px), not `space.xl` (32px)
- [ ] Column subtitles ("PICK ONE ZONE ON YOUR FOE" / "ONE PAIR, TWO ZONES COVERED") are visible in `text.muted` at 10px
- [ ] Placeholder text ("Select zone" / "Select pair") is `text.muted`, italic, 14px, weight 400
- [ ] Selected zone text uses semantic color (attack.text or block.text), 14px, weight 600, uppercase
- [ ] Corner accents: red tl+bl on ATTACK column, green tr+br on BLOCK column, ~0.35 opacity
- [ ] Footer is a single horizontal row: [ATTACK selection | BLOCK selection | LOCK IN button]
- [ ] LOCK IN disabled = filled gold background at 50% opacity (Button primitive default), NOT outlined/bordered
- [ ] Both silhouette column wrappers have paddingTop >= space.sm (8px)
- [ ] All overlay/mask logic is unchanged and still scales with the width prop
- [ ] No new files created outside BodyZoneSelector.tsx edits + GameScreens.tsx width change
- [ ] No changes to tokens.ts or any primitive component
- [ ] MockBattle.tsx is untouched
