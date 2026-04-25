# Battle Screen Analysis — Shared Lobby Layout vs Separate Route

Scope: compare design_V2 BattleScreen with design_V2 LobbyScreen and the
production implementations of both, then recommend whether the battle UI
should keep its own route or share a route with the lobby.

Note on file paths: the prompt asked for `design_V2/src/screens/...` and
`src/Kombats.Client/src/modules/.../screens/LobbyScreen.tsx`. The
design_V2 tree has no `screens/` directory — the BattleScreen, MainHub
(lobby), and LobbyScene live in `design_V2/src/app/components/GameScreens.tsx`.
Production paths used:

- `design_V2/src/app/components/GameScreens.tsx` (LobbyScene/MainHub @ L301/L371,
  BattleScreen @ L427)
- `design_V2/src/app/components/BodyZoneSelector.tsx` (1490 lines)
- `design_V2/src/app/components/GameShell.tsx` (GameShell, LobbyHeader,
  LobbyChatDock)
- `src/Kombats.Client/src/modules/battle/screens/BattleScreen.tsx`
- `src/Kombats.Client/src/modules/player/screens/LobbyScreen.tsx`
- `src/Kombats.Client/src/modules/battle/components/BodyZoneSelector.tsx` (609 lines)
- `src/Kombats.Client/src/modules/battle/components/FighterCard.tsx`
- `src/Kombats.Client/src/modules/player/components/FighterNameplate.tsx`
- `src/Kombats.Client/src/app/router.tsx`
- `src/Kombats.Client/src/app/shells/{SessionShell,LobbyShell,BattleShell}.tsx`

---

## Step 1 — Layout comparison (design_V2 + production)

### design_V2 LobbyScene (used by MainHub/QueueScreen)

- Background: `bgImage = imports/bg-1.png`, `bg-cover bg-center`,
  overlay `from-transparent via-ink-navy/30 to-ink-navy/60`
- Wrapped in `<GameShell header={LobbyHeader} bottomOverlay={LobbyChatDock}>`
- ONE fighter column anchored bottom-LEFT (`FIGHTER_COLUMN_LEFT_CLASSNAME`)
  - `FighterNameplate name="Kazumi" hp/maxHp` above
  - `motion.img` of `characterImage` at `h-[82vh]`, drop-shadow filter,
    `marginBottom: -17vh`
- Center card: 320px wide, `translate(-50%, -55%)`, swaps QueueCard / SearchingCard

### design_V2 BattleScreen (`GameScreens.tsx:427`)

- Background: SAME `bgImage` and SAME overlay gradient
- Wrapped in the SAME `<GameShell header={LobbyHeader} bottomOverlay={LobbyChatDock with battleLog}>`
- TWO fighter columns:
  - LEFT: identical `FIGHTER_COLUMN_LEFT_CLASSNAME`, same nameplate, same image,
    same `FIGHTER_IMAGE_CLASSNAME` and `FIGHTER_IMAGE_BASE_FILTER`, same
    `marginBottom: -17vh`. Player sprite rendering is **byte-identical** to lobby.
  - RIGHT: `FIGHTER_COLUMN_RIGHT_CLASSNAME`, opponent `FighterNameplate` with
    `hpBarMirror`, sprite wrapped in `transform: scaleX(-1)` + `hue-rotate(180deg)`
- Center overlay: 540px wide (vs 320), `translate(-50%, -62%)` (vs -55%),
  contains DSPanel(glass) → title + meta row (round/timer/turn) + divider + BodyZoneSelector + LOCK IN button

### Production LobbyScreen (`modules/player/screens/LobbyScreen.tsx`)

- Wraps in `LobbyShell` (Outlet with `p-3`)
- Re-paints `bgScene = bg-1.png` via `<img absolute inset-0>` and overlay
  `from-transparent via 30/60 to ink-navy/60` (note: SessionShell **also**
  mounts the same bg below)
- ONE sprite bottom-LEFT, `FighterNameplate` component (player module),
  `h-[82vh]`, same drop-shadow + `-17vh` margin
- Center overlay 320px (`w-80`) with `translate(-50%, -55%)` — swaps
  `SearchingCard` / `LevelUpBanner+StatAllocationPanel` / `QueueCard`
- Cancels LobbyShell padding via `-m-3` so the scene reaches the edges

### Production BattleScreen (`modules/battle/screens/BattleScreen.tsx`)

- Wraps in `BattleShell` (Outlet, hosts `BattleConnectionHost` + `BattleUnloadGuard`)
- Re-paints SAME `bgScene = bg-1.png` (also mounted by SessionShell). Overlay
  is slightly different from lobby: `40% → 15% → 88%` ink-navy bottom gradient
  (lobby uses `0 → 30% → 60%`) — a darker, more dramatic bottom for the
  combat panel readability
- TWO sprite columns with `FighterCard` (battle module's variant of nameplate),
  player-side `tone="friendly"`, opponent `tone="hostile"` + `hpBarMirror` +
  `alignRight`. Sprite: `h-[min(70vh,620px)]` (bounded vs lobby's `h-[82vh]`),
  opponent wrapped in `scaleX(-1)`, optional `hue-rotate(180deg)` only when
  both fighters share the same avatar art
- Center overlay 540px (`w-[min(540px,calc(100%-2rem))]`),
  `translate(-50%, -55%)` (NOT -62% like design), glass panel containing:
  CombatPanelHeader (title) → CombatMetaRow (round/timer/connection/turn pill)
  → divider → ActionPanelSlot (BodyZoneSelector or TurnResultPanel)
- BattleEndOverlay (Radix Dialog) appears on `phase==='Ended'`

### Direct answers to the six questions

1. **Same background image?** Yes — both screens use `bg-1.png`. In production
   it is mounted three times in the tree at once (SessionShell + LobbyScreen,
   or SessionShell + BattleScreen).
2. **Same sprite position (left)?** Yes — same `FIGHTER_COLUMN_LEFT_CLASSNAME`
   in design, same bottom-left absolute anchor in production.
3. **ADDS a second sprite (opponent right)?** Yes — design adds a mirrored
   right-side sprite with `hue-rotate(180deg)`. Production does the same
   (hue-rotate only when avatars collide). The lobby has no such column.
4. **Same nameplate?** Conceptually yes, but **two distinct components**:
   lobby uses `player/components/FighterNameplate` (reads from `usePlayerStore`
   + `playerKeys.card` query), battle uses `battle/components/FighterCard`
   (props-driven, accepts `tone`/`hpBarMirror`/`alignRight`). They share visual
   tokens (halo, nameShadow, color-mix tile tints) but are independent files.
5. **Header/chrome?** Both share `SessionShell` (AppHeader + BottomDock). The
   chat dock survives lobby ↔ battle navigation because it is mounted above
   `BattleGuard`. The result screen suppresses the dock (`isBattleResult`).
6. **Fundamental layout differences vs lobby?**
   - Battle adds an opponent sprite + nameplate (bottom-right column)
   - Center overlay is significantly wider (540 vs 320) and contains a much
     more complex composition (header + meta row + 2-column silhouette
     selector + CTA) instead of a single column card
   - Sprite size is capped (`h-[min(70vh,620px)]`) so the silhouette panel
     never visually collides with characters on shorter viewports
   - Bottom gradient is darker (88% vs 60%) for combat-panel contrast
   - Battle adds `BattleEndOverlay` (modal dialog) on top of the scene

---

## Step 2 — Combat panel (design_V2)

`design_V2/src/app/components/BodyZoneSelector.tsx` is the centerpiece.

### Technology

- Pure HTML `<div>`s with CSS `mask-image` composition. The fighter
  silhouette is a PNG (`assets/fighters/silhouette.png`) used as the
  base mask. Vertical zone bands are produced as `linear-gradient`
  masks layered on top via `WebkitMaskComposite: source-in`.
- An SVG layer is used **only** for the outline + outer-glow effect on
  selected/hovered zones (`feMorphology` to derive an outline from the
  silhouette, `linearGradient`-based vertical mask so the outline
  feathers at band edges instead of clipping on a rect).
- Framer Motion (`motion/react`) for the Mitsudomoe waiting spinner
  (rotating ring + counter-rotating image).

### Visual zone selection mechanics

- Five zones — `Head`, `Chest`, `Stomach`, `Waist`, `Legs` (note **Stomach**)
  — each with a `top%/bottom%` band relative to the silhouette container
  height (`width × 1.5` px).
- 15% feather fraction per band, **overlapping** at shared boundaries
  (each zone extends `feather/2` past the boundary line so two adjacent
  fills sum to ≈1 alpha at the seam — no transparent stripe).
- Hit areas are absolute-positioned `<button>` rectangles per zone band,
  full-column width, `onMouseEnter` sets hover, `onClick` selects.
- Selection fills: radial-gradient fill (`rgba(rgb,0.7) → 0.3 → 0`) clipped
  to silhouette × zone-mask; `kombats-zone-pulse` 2.5s ease-in-out animation.
- Hover preview: per-zone always-mounted div, flat-alpha fill (`rgba(rgb,0.25)`),
  150ms `kombats-zone-outline-in` fade, hidden when zone is already selected.
- Block mode adjacency: an adjacent block pair is rendered as **one** paired
  fill (so the shared boundary has no feather seam); the wraparound
  `Legs & Head` pair falls back to two singles. A second adjacency pass
  computes "hard edges" so a hover preview meets a selected neighbour
  flush instead of leaving a faded band.
- Outline+glow: SVG layer with `feMorphology` dilate, masked by a vertical
  `linearGradient` so the outline stops match the zone feather stops; ID-
  namespaced per mode so the two stages mounted side-by-side don't
  collide.
- Corner ornament marks (`CornerMark`) at the top/bottom corners of each
  silhouette column (slim L-shaped borders, attack-crimson on the left,
  block-jade on the right).

### Animations

- `kombats-zone-pulse` (selected zone fill, 2.5s loop)
- `kombats-zone-outline-in` (hover preview, 150ms one-shot)
- Mitsudomoe waiting state: outer ring rotates `-360°` over 12s, image
  rotates `+360°` over 8s, both `linear`, `repeat: Infinity`; soft
  radial gold glow backdrop. The waiting block reserves the same
  pixel height as the diptych (`columnContentHeightPx`) so the panel
  never jumps size between phases.
- The whole BodyZoneSelector is wrapped by the parent BattleScreen in a
  larger glass `DSPanel` with the title, meta row, divider, and the
  LOCK IN button below.

### Complexity

- **1490 lines** in one file. Sub-components: `BodyZoneSelector` (driver),
  `SilhouetteStage` (per-side body, ~560 lines on its own), `CornerMark`,
  `DebugZoneOverlay`. Type plumbing for `FilledItem` / `HoverOutlineTargets`
  / `HardEdges` / `NeighbourFeathers` / `ZonePair`.
- Zone math (feather geometry, gradient stops, mask composition) accounts
  for most of the bulk; the visual surface is conceptually simple but the
  edge-meeting precision drives the line count.

### Data consumed (design)

- Local types only: `BodyZone`, `BlockPair` exported from this file.
- Props from MockBattle / BattleScreen: `attack`, `block`, `onAttackChange`,
  `onBlockChange`, `width`, `isWaiting`, `action` (LOCK IN button slot).

---

## Step 3 — Production BodyZoneSelector + battle store fields

`src/Kombats.Client/src/modules/battle/components/BodyZoneSelector.tsx` (609 lines).

### How it's currently implemented

- Same fundamental approach: silhouette PNG (`@/ui/assets/silhouette.png`)
  as base mask + per-zone `linear-gradient` band masks composited via
  `mask-composite: intersect`.
- Five zones — `Head`, `Chest`, **`Belly`**, `Waist`, `Legs` (note: production
  uses **Belly** because that is the BFF/`BattleZone` type; design uses
  **Stomach**).
- 3% feather (vs design's 15% fraction-of-band), simple linear-gradient
  with no overlap math. Adjacent fills can produce a faint seam if they
  meet exactly on a band boundary.
- Selection: radial-gradient fill, `kombats-zone-pulse` 2.5s loop (same
  keyframes as design).
- Hover: flat alpha (`rgba(rgb,0.25)`), `kombats-zone-outline-in` 150ms.
- Block mode: two-click flow with local `blockPrimary` state. First click
  arms primary, second click commits via `actions.selectBlockPair([a,b])`
  if `isValidBlockPair`. Click on already-committed primary → restart from
  there.
- Hit areas: per-zone `<button>` stacked vertically; same per-zone hover
  state via `useHoverZone`.
- LockedInSpinner: Mitsudomoe with rotating ring (-360 over 12s) +
  counter-rotating image (+360 over 8s) — matches design intent.
- CornerMarks present (slim L-shape, attack-crimson left / block-jade right).
- Bottom CTA: in-component "Lock In" button (not slotted via `action`
  prop like design); switches to "Locked In ✓" outline button when
  `phase === Submitted | Resolving`.

### Visual approach

- HTML `<div>` + CSS masks (no SVG outline layer — design uses SVG with
  `feMorphology`; production omits this entirely).
- No per-zone outline/glow on selection or hover.
- Glass-in-glass container is `bg-glass-subtle` with `border-subtle`,
  rounded-sm, blurred backdrop.

### What's broken or visually weaker than design

- **No outline+glow layer.** Design's selected zone gets a subtle
  feMorphology-derived outline that sells the "tactical target" aesthetic.
  Production's selected zone is a fill-only radial gradient — flatter.
- **Simpler feather math.** Production uses fixed 3% feather without
  overlap geometry, so adjacent block-pair fills can show a faint seam at
  shared boundaries. Design renders adjacent pairs as a single combined
  mask to avoid the seam entirely.
- **No "hard-edge" adjacency pass** between hover and selected — production
  hover and selected fills can overlap with ramped opacity on the boundary
  (visible band).
- **Zone naming inconsistency.** UI ships `Belly`, design ships `Stomach`.
  Whichever is canonical (BFF says `Belly`), the mismatch with the design
  artefact means design references in PRs need translating.
- **No SVG mode-namespaced filter IDs** — but production also doesn't use
  SVG, so this is non-applicable; just noting the architectural divergence.
- **Container layout uses `grid grid-cols-2`** with `p-4`, vs design's
  flex with explicit `combatZoneStyle` inset glass surface and corner-mark
  positioning relative to each column. Visually similar but the corner
  marks land in slightly different relative positions.

### Battle store fields used

- From `useBattlePhase()`: `phase` (`TurnOpen` / `Submitted` / `Resolving`
  for waiting-state branching).
- From `useBattleConnectionState()`: `connectionState` (gates `disabled`
  + shows the "Waiting for connection before submitting…" caption).
- From `useBattleActions()` (composite hook):
  - `selectedAttackZone: BattleZone | null`
  - `selectedBlockPair: [BattleZone, BattleZone] | null`
  - `canSubmit: boolean`
  - `isSubmitting: boolean`
  - `selectAttackZone(zone)`
  - `selectBlockPair([a, b])`
  - `submitAction()`
- From `zones.ts`: `ALL_ZONES`, `VALID_BLOCK_PAIRS`, `isValidBlockPair`.

The parent `BattleScreen` additionally consumes: `playerAId/B`, `playerAName/B`,
`playerAHp/B`, `playerAMaxHp/B`, `lastError`, `battleId`, `useBattleTurn().turnIndex`,
`useBattleTurn().deadlineUtc`, `usePlayerStore.character`, `useAuthStore.userIdentityId`,
plus `playerKeys.card(id)` queries for both fighters' cards.

---

## Step 4 — Route decision

### What is shared between lobby and battle

- Same background image (`bg-1.png`) — already mounted by `SessionShell`
- Same scene gradient family (just different stop intensities)
- Same player sprite anchor (bottom-left, `~70-82vh`, drop-shadow filter,
  negative margin)
- Same chrome (`SessionShell` already wraps both: AppHeader + BottomDock)
- Same nameplate visual language (halo + nameShadow + color-mix tone tiles)
  — but lobby and battle use different concrete components

### What is fundamentally different

- **Battle adds a second sprite + nameplate column** (bottom-right, mirrored).
  Lobby has none.
- **Battle's center overlay is structurally different** — wider (540 vs 320),
  multi-section panel (header + meta row + divider + diptych selector + CTA)
  vs lobby's single-card overlay (queue / searching / level-up).
- **Battle owns lifecycle that lobby does not need:**
  - `BattleConnectionHost` (battle SignalR connection scoped to `/battle/:battleId/*`)
  - `BattleUnloadGuard` (`beforeunload` warning during active phases)
  - `BattleEndOverlay` (Radix Dialog above the scene)
- **Battle has nested children sharing the connection** — `/battle/:battleId`
  (live) and `/battle/:battleId/result` (post-battle screen) both mount
  under `BattleShell` so the store survives the live → result handoff.
- **URL semantics differ.** `/battle/:battleId` is parameterised; the
  battle ID is the source of truth that `BattleGuard` checks. Lobby has
  no such parameter.
- **Sprite size is capped** in battle (`h-[min(70vh,620px)]`) to leave
  room for the wider center panel; lobby uses an uncapped `h-[82vh]`.

### Recommendation: KEEP separate routes

The current two-route architecture (`/lobby` under `LobbyShell` and
`/battle/:battleId` under `BattleShell`, both under one `SessionShell`)
is the right shape. Reasons:

1. **Lifecycle alignment.** `BattleShell` owns concerns that are scoped
   to "we are in a battle" — SignalR connection, beforeunload guard,
   shared parent for the result screen. Hoisting these into a single
   shared route would either mount them unconditionally on the lobby
   (wasteful, leaks the unload prompt) or put a conditional at the
   screen level (uglier than a shell-level mount).
2. **Guard re-evaluation is URL-driven.** `BattleGuard` redirects
   matched players to `/battle/:battleId` and sends others back to
   `/lobby`. Making both render under one URL would force the guards
   to operate on derived state inside one screen, undermining the
   "routes are state projections" rule (`architecture-boundaries.md`).
3. **Result screen sharing.** `/battle/:battleId/result` is a sibling
   that needs the same battle store + connection. It's a child of
   `BattleShell` today; collapsing battle into the lobby route would
   either require re-mounting that connection for the result screen
   or moving connection ownership to a non-shell layer.
4. **The "shared visuals" problem is already solved** by `SessionShell`
   mounting the background once and screens painting their own scene
   overlay on top. The double `<img bgScene>` mount on each screen is a
   small redundancy (and a low-cost cleanup if desired) but it doesn't
   justify route consolidation.
5. **A second sprite is structural, not chrome.** Adding/removing the
   opponent column based on derived state inside one shared screen would
   add a branching layer, force layout recomputation on transition, and
   make the `BattleEndOverlay` placement awkward.

### What CAN be unified to reduce divergence (without changing routes)

These are the real wins available, none of which need a route change:

1. **Hoist the player-sprite anchor to a shared component / constants
   module.** Today design uses `FIGHTER_COLUMN_LEFT_CLASSNAME`,
   `FIGHTER_IMAGE_CLASSNAME`, `FIGHTER_IMAGE_BASE_FILTER`, and
   `FIGHTER_IMAGE_MARGIN_BOTTOM` as shared constants in one file.
   Production duplicates the same anchor logic in two screens with
   slightly different `h-[...]` values. A single `<PlayerSpriteAnchor>`
   primitive (or shared constants) would lock parity.
2. **Stop double-painting `bg-1.png`.** SessionShell already mounts it
   beneath the AppHeader. LobbyScreen and BattleScreen each mount their
   own `<img>` on top. Keep the screen-level overlay div (it differs by
   stop intensity) but drop the redundant `<img>`.
3. **Reconcile zone naming.** Production says `Belly`, design says
   `Stomach`. Pick one (BFF type `Belly` is the source of truth) and
   update the design references when porting visual specs.
4. **Port the SVG outline+glow layer** from design's BodyZoneSelector
   to production. This is the largest single visual upgrade available
   and it lives entirely inside the existing `BodyZoneSelector` file —
   no shell, route, or store changes needed.
5. **Port the overlap-feather + hard-edge adjacency math** so block-pair
   fills don't show seams on shared boundaries.
6. **Consider unifying `FighterCard` (battle) and `FighterNameplate`
   (lobby) behind one prop-driven primitive** — the visual tokens
   (halo, name shadow, tile tint) are already shared inline. One
   component with `mode="lobby" | "battle"` and an `hpBarMirror`/
   `alignRight` switch would eliminate ~100 lines of duplication.

### Summary

- Same route as lobby? **No.**
- Separate route? **Yes — keep the existing `/lobby` vs `/battle/:battleId`
  split.** It is justified by lifecycle (SignalR, beforeunload, result-
  screen sibling), guard semantics, URL parameterisation, and the
  structural addition of the opponent column.
- The shared visuals (bg, player sprite, chrome) are best handled by
  `SessionShell` plus a shared sprite-anchor primitive — not by route
  consolidation.
