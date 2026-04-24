# Kombats Design Reference

Visual extract from `design_V2/` — a React mockup app with no real backend, intended only as a source of visual truth (look, tokens, effects, assets) for the production frontend in `src/`.

Scope of this document:
- **Included:** screen layouts, design tokens, exact CSS for effects, asset list, JSX/CSS snippets for visually relevant components.
- **Excluded:** state management, routing, mocks, business logic, file/folder architecture choices.

All file references below are inside `design_V2/`.

---

## 1. Screen Inventory

App entry point: `src/app/App.tsx` switches between 9 screen states. Every authenticated screen uses the same `GameShell` (top nav, full-bleed background, optional bottom chat dock).

### 1.1 LoginScreen — `app/components/LoginScreen.tsx`

State: logged-out, only entry to the app.

Layout: full viewport flex-centered, dark background, single glass `Panel` (`variant="glass"`, `radius="lg"`, `elevation="panelLift"`).

Content stack (vertical, centered, ~380px wide):
1. Diamond logo: 60×60 rotated 45deg gold-bordered square with glow, centered ideogram `拳` (counter-rotated -45deg, Noto Serif JP, gold).
2. Title `THE KOMBATS` — Cinzel 28px, gold, letter-spacing 0.20em, gold text-shadow bloom.
3. Tagline `Enter the Arena` — small uppercase muted (typography.labelDisplay).
4. Two full-width buttons stacked: primary "Log In" (gold), secondary "Sign Up" (outlined).

Behind the panel: an "ambient glow" — 480×480 radial-gradient circle, gold @ 8% center fading to transparent, behind the panel.

### 1.2 OnboardingScreen — `app/components/OnboardingScreen.tsx`

State: newly-registered, no profile yet. Pick avatar + display name.

Background: `bg-1.png` cover-fit + two layered ink-navy gradients (top-to-bottom darken, bottom-to-top lighten). Same scene used by all in-game screens.

Layout:
- Top: `LobbyHeader` (TopNavBar).
- Bottom-left: selected fighter sprite, anchored bottom (h-[82vh], drop-shadow-2xl, marginBottom -17vh so it bleeds offscreen below the header).
- Center: `OnboardingCard` (offset slightly left at translate(-42%, -52%)) containing:
  - 5-column grid of avatar cards (2:3 aspect, dim if unselected, gold underline if selected).
  - TextInput "Display Name" (3–16 chars, validated).
  - Continue button (primary, disabled until valid).

Avatar swap animation: Framer Motion `AnimatePresence` `mode="wait"`, fade + 30px x-shift, 0.35s ease-out.

### 1.3 MainHub (Lobby) — `GameScreens.tsx :: MainHub`

State: authenticated, idle. Background scene + bottom chat dock + center "Ready to Fight" card.

Composition:
- `GameShell` with `LobbyHeader` + `LobbyChatDock`.
- Background: `bg-1.png` + ink-navy bottom-gradient overlay.
- Bottom-left: `FighterNameplate` + character sprite (`charackter.png`), anchored bottom-left.
- Center (translate(-50%, -55%) at top-1/2 left-1/2, 320px wide): `QueueCard` in `status="ready"`.

### 1.4 QueueScreen — `GameScreens.tsx :: QueueScreen`

State: searching for opponent.

Same as Lobby but center card is `QueueCard` `status="searching"` — title becomes "Searching for Opponent", a `MitsudomoeSpinner` appears (rotating gold icon + counter-rotating ring + radial glow), an elapsed timer counts up, primary button becomes "Cancel Search".

### 1.5 BattleScreen — `GameScreens.tsx :: BattleScreen`

State: in active combat.

Layout:
- `GameShell` with `LobbyHeader` + `LobbyChatDock` (now with extra "Battle Log" tab).
- Background scene + ink-navy gradient.
- Bottom-left: player nameplate + sprite, jade HP bar.
- Bottom-right: opponent nameplate + sprite (mirrored via `transform: scaleX(-1)` and `hue-rotate(180deg)` filter), crimson HP bar (`hpBarMirror` so it depletes right-to-left).
- Center, translate(-50%, -62%): combat panel (540px wide glass `Panel`) containing:
  - Cinzel header "Select Attack & Block" (or "Awaiting Opponent" when locked in).
  - Meta row: 3-col grid `1fr auto 1fr` — Round label / center clock+time / "Your Turn" or "Opponent's Turn" pill with glowing gold dot.
  - `BodyZoneSelector` — diptych of two silhouettes (ATTACK left in red, BLOCK right in green) with full SVG masking, gold corner marks, and "LOCK IN" CTA below.
- Post-lock-in waiting state replaces silhouettes with the centered Mitsudomoe spinner; CTA becomes a disabled "Locked In ✓".

### 1.6 VictoryScreen — `GameScreens.tsx :: VictoryScreen`

State: just won. Heavily atmospheric.

Layered visual stack on top of the same background scene:
1. Background scene image.
2. Dark overlay (rgba 0,0,0,0.65) — heavier than defeat to keep gold readable.
3. Rotating conic-gradient "rays" (24 alternating gold beams, 60s linear infinite rotation, masked to a small radial halo at 25% from top).
4. Two-layer bloom at the title position: wider gold halo + smaller white core (perceived light source).
5. Content column (z-index 20):
   - Title row: thin tapered gradient lines on either side of `VICTORY` (Cinzel 56px, ceremonial bright gold `#E8B830`, triple-layer text-shadow).
   - Subtitle "Triumph in Combat".
   - Glass `RESULT_PANEL` (520px) with:
     - Top accent line: 3px gradient transparent→gold→transparent.
     - Two-column "You" / "Opponent" name grid with WINNER/Defeated labels.
     - Divider, "Rewards" section (XP gained, Rating gained — green positive values).
     - Optional "Final Exchange" block (left-border tinted gold, glassSubtle bg).
     - Two CTAs: "Battle Again" / "Return to Lobby".

### 1.7 DefeatScreen — `GameScreens.tsx :: DefeatScreen`

State: just lost. Atmosphere swaps from gold/light to red/closing-in.

Layered visual stack:
1. Background scene.
2. Dark overlay (rgba 0,0,0,0.5) — slightly lighter than victory so the red atmosphere reads.
3. Defeat vignette: radial gradient transparent center → crimson @ 12% mid → crimson @ 25% edges.
4. SVG slash overlay: 3 diagonal slashes, each rendered as a thick crimson base stroke + thin bright-red centerline, opacity 0.2.
5. Same content column structure as victory but with:
   - Tapered gradient lines in crimson.
   - `DEFEAT` title in crimson with crimson text-shadow.
   - Top accent line in crimson.
   - "Defeated" label uses crimson when it's the player; "Victor" label in gold for the opponent.
   - Reward row: XP small positive (green), Rating Lost negative (red).
   - "Final Exchange" block has a crimson left-border tint.

### 1.8 LoadingScreen — `app/components/LoadingScreen.tsx`

State: generic loading placeholder.

Centered:
- 320×320 stage — radial gold glow → counter-rotating gold hairline ring (220px, 12s) → rotating Mitsudomoe icon (140px, 8s, opacity 0.5, mix-blend-mode: screen).
- "Loading" label (Cinzel 14px, muted gold), opacity pulses 0.6→1→0.6 over 3s.

### 1.9 NotFoundPage — `app/components/NotFoundPage.tsx`

State: route not found.

Centered glass `Panel` with:
- Mitsudomoe icon (100px, opacity 0.35).
- `404` (Cinzel 64px, gold, gold text-shadow).
- "PATH NOT FOUND" small caps.
- "Return to Lobby" button.

### 1.10 Cross-Screen Transitions

- Fighter sprite mounts use Framer Motion `initial={{ opacity: 0, x: -50 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}`.
- Panel pop-ins via `AnimatePresence` with opacity + 8px y-shift, 0.2s.
- Avatar swap on onboarding: 0.35s fade with 30px x-shift.
- Victory rays: continuous 60s linear rotation.
- Mitsudomoe spinner: ring -360 over 12s, icon +360 over 8s (counter-rotating).
- Selected battle zone fill: `kombats-zone-pulse` keyframe — opacity 0.8→1→0.8 over 2.5s.
- Hover zone outline: `kombats-zone-outline-in` 150ms fade.
- HP bar fill width: 300ms ease-out transition.
- Loading label opacity pulse: 3s easeInOut.

---

## 2. Design Tokens

Two coexisting token systems:
- `src/styles/theme.css` — legacy `--kombats-*` CSS variables (used by older Tailwind classes).
- `src/design-system/tokens.ts` — the canonical design system (new screens import from here).

### 2.1 Color Palette

#### Surfaces / Backgrounds (theme.css)
```css
--kombats-charcoal:     #1a1a1f;
--kombats-ink-navy:     #0f1419;   /* page background */
--kombats-deep-indigo:  #1e1e2e;
--kombats-smoke-gray:   #2a2a35;

--kombats-panel:           rgba(26, 26, 31, 0.92);
--kombats-panel-border:    rgba(154, 154, 168, 0.18);
--kombats-panel-highlight: rgba(201, 169, 97, 0.08);
```

#### Glass surface variants (tokens.ts)
```ts
surface = {
  glass:        'rgba(15, 20, 28, 0.70)',  // default translucent panel
  glassDense:   'rgba(15, 20, 28, 0.88)',  // text-heavy / modal
  glassSubtle:  'rgba(15, 20, 28, 0.55)',  // HUD overlays, HP plates
  solidAccent:  'rgba(15, 20, 28, 0.96)',  // disconnect / critical notifs
}
```

#### Accent (Gold)
```css
--kombats-gold:       #c9a961;
--kombats-gold-light: #d4b876;
--kombats-gold-dark:  #b8954a;
```
```ts
accent = {
  primary: '#c9a25a',                   // main gold (button bg)
  muted:   'rgba(201, 162, 90, 0.60)',
  text:    'rgba(201, 162, 90, 0.90)',  // gold for sender names, headers
}
```
Ceremonial bright gold (only used for VICTORY title): `#E8B830`.

#### Crimson (Attack / Danger / HP Critical)
```css
--kombats-crimson:       #c03744;
--kombats-crimson-dark:  #a02835;
--kombats-crimson-light: #d04654;
```
```ts
semantic.attack = { base: '#c03744', soft: 'rgba(192, 55, 68, 0.15)', text: '#d04654' };
```

#### Jade (Block / Success / HP Healthy)
```css
--kombats-jade:       #5a8a7a;
--kombats-jade-dark:  #4a7a6a;
--kombats-jade-light: #6a9a8a;
```
```ts
semantic.block = { base: '#5a8a7a', soft: 'rgba(90, 138, 122, 0.15)', text: '#6a9a8a' };
```

#### Moon Silver (Neutral text/borders)
```css
--kombats-moon-silver:       #9a9aa8;
--kombats-moon-silver-light: #b8b8c4;
--kombats-moon-silver-dark:  #7a7a88;
```

#### Text
```css
--kombats-text-primary:   #e8e8f0;
--kombats-text-secondary: rgba(232, 232, 240, 0.75);
--kombats-text-muted:     rgba(232, 232, 240, 0.48);
```
```ts
text.onAccent = '#0f1419';   // dark text on gold button
text.onDanger = '#ffffff';   // white text on danger button
```

#### Borders
```ts
border = {
  subtle:   '0.5px solid rgba(255, 255, 255, 0.06)',  // default panel edge
  divider:  '1px solid rgba(255, 255, 255, 0.04)',    // inner dividers
  emphasis: '0.5px solid rgba(255, 255, 255, 0.12)',  // hover/focus
}
```

### 2.2 Typography

Fonts loaded from Google Fonts (`styles/fonts.css`):
```
Inter (400, 500, 600, 700, 800)
Noto Sans JP (400, 500, 600, 700, 800)
```

System-fallback display family for ceremonial titles (NOT loaded via Google Fonts in this app — relies on installed Cinzel; fallback chain to Trajan/Noto Serif JP):
```
"Cinzel", "Trajan Pro", "Noto Serif JP", serif
```

Font-family rules:
```css
:root           { font-family: 'Inter', -apple-system, ..., sans-serif; }
h1..h6          { font-family: 'Noto Sans JP', 'Inter', sans-serif; letter-spacing: 0.03em; }
button          { font-family: 'Inter', ...; letter-spacing: 0.05em; }
```

Display heading (titles like THE KOMBATS, VICTORY, error code):
```ts
fontFamily: '"Cinzel","Trajan Pro","Noto Serif JP",serif'
fontWeight: 600 or 700
letterSpacing: '0.16em' to '0.34em'
textTransform: 'uppercase'
```

Type scale for inline labels (tokens.ts):
```ts
typography = {
  label:        { fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 500 },
  labelLarge:   { fontSize: '13px', letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 500 },
  labelDisplay: { fontSize: '12px', letterSpacing: '0.24em', textTransform: 'uppercase', fontWeight: 500 },
}
```

Common literal sizes used in screens:
- Diamond logo glyph: 18 (TopNav) / 30 (LoginScreen).
- Brand wordmark: 22 (TopNav), 28 (LoginScreen).
- Result title (VICTORY/DEFEAT): 56.
- 404 code: 64.
- Onboarding card title: 22.
- Combat panel section header: 15 / 18.
- Body text: 12–14.
- HP bar number: 13 (Cinzel italic, tabular-nums).

### 2.3 Spacing

```ts
space = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
}
```
Documented one-off literals: `12px` for nav-bar vertical padding and popover body padding (no 12px token).

### 2.4 Radius

```ts
radius = {
  sm: '4px',   // inputs, pills, chips, KPI tiles
  md: '8px',   // default panels, buttons
  lg: '12px',  // large modals, chat dock, login panel
}
```
Pills (chat input): `borderRadius: 9999`.

### 2.5 Blur / Backdrop

```ts
blur = {
  panel:  'blur(20px)',  // standard glass
  subtle: 'blur(10px)',  // HUD overlays / thin surfaces
}
```
Applied via `backdropFilter` + `WebkitBackdropFilter`.

### 2.6 Shadows

```ts
shadow = {
  panel:     '0 12px 32px rgba(0, 0, 0, 0.50), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
  panelLift: '0 18px 48px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
  none:      'none',
}
```
Inset 1px white highlight is the signature top-edge gloss on every glass panel.

### 2.7 Text Shadow (legibility on glass / scene art)

```ts
textShadow = {
  onGlass:       '0 1px 2px rgba(0, 0, 0, 0.8)',
  onGlassStrong: '0 1px 2px rgba(0, 0, 0, 0.95), 0 0 6px rgba(0, 0, 0, 0.7)',
  none:          'none',
}
```
Used on HP numbers sitting directly over fighter sprites, fighter names, battle log entries.

### 2.8 Animation Timing

(From inline use across components — no token file.)
- Color transitions (hover, focus): 150ms ease.
- Border color reveals: 300ms ease.
- HP bar width: 300ms ease-out.
- Pop-in (panel/popover): 200ms.
- Avatar swap: 350ms ease-out.
- Mitsudomoe ring rotation: 12s linear infinite (counter-clockwise).
- Mitsudomoe icon rotation: 8s linear infinite (clockwise).
- Selected zone pulse: 2.5s ease-in-out.
- Victory rays rotation: 60s linear infinite.
- Loading text opacity pulse: 3s easeInOut.

---

## 3. CSS Techniques & Effects

### 3.1 Glass Panel (signature surface)

The single visual atom of the app. Every panel is composed:

```ts
{
  background: 'rgba(15, 20, 28, 0.70)',    // surface.glass
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '0.5px solid rgba(255, 255, 255, 0.06)',
  borderRadius: '8px',
  boxShadow: '0 12px 32px rgba(0, 0, 0, 0.50), inset 0 1px 0 rgba(255, 255, 255, 0.04)',
}
```

### 3.2 Diamond Logo (45° rotated frame + counter-rotated glyph)

Bespoke brand mark, no asset.

```jsx
<div style={{
  position: 'relative', width: 60, height: 60,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transform: 'rotate(45deg)',
  border: '1px solid rgba(201, 162, 90, 0.55)',
  background: 'rgba(201, 162, 90, 0.05)',
  boxShadow: 'inset 0 0 0 1px rgba(201, 162, 90, 0.08), 0 0 20px rgba(201, 162, 90, 0.22)',
}}>
  <span style={{
    transform: 'rotate(-45deg)',
    color: '#c9a25a', fontSize: 30, lineHeight: 1,
    fontFamily: '"Noto Serif JP","Hiragino Mincho ProN","Yu Mincho",serif',
  }}>拳</span>
</div>
```

### 3.3 Ambient Radial Glow

Reusable behind centered panels, diamonds, etc.

```ts
{
  position: 'absolute', top: '50%', left: '50%',
  width: 480, height: 480,
  transform: 'translate(-50%, -50%)',
  borderRadius: '50%',
  background: 'radial-gradient(circle, rgba(201, 162, 90, 0.08) 0%, rgba(201, 162, 90, 0.03) 40%, transparent 70%)',
  pointerEvents: 'none',
}
```

### 3.4 Cinzel Title Bloom (gold glow text)

```ts
{
  fontFamily: '"Cinzel","Trajan Pro","Noto Serif JP",serif',
  color: '#c9a25a',
  fontSize: 28,
  fontWeight: 700,
  letterSpacing: '0.20em',
  textTransform: 'uppercase',
  textShadow: '0 2px 16px rgba(201, 162, 90, 0.25)',
}
```

For the bigger VICTORY title, three layered shadows:
```ts
textShadow: '0 0 30px rgba(255,255,255,0.3), 0 0 60px rgba(232,184,48,0.5), 0 0 100px rgba(232,184,48,0.2)'
```

For DEFEAT:
```ts
textShadow: '0 0 40px rgba(192,55,68,0.6), 0 0 80px rgba(192,55,68,0.25)'
```

### 3.5 Victory Rotating Rays (conic gradient + radial mask)

24 alternating gold beams, masked to a halo around the title.

```ts
const VICTORY_RAYS_STYLE = {
  position: 'fixed',
  top: '50%', left: '50%',
  width: '150vmax', height: '150vmax',
  marginTop: '-75vmax', marginLeft: '-75vmax',
  borderRadius: '50%',
  pointerEvents: 'none',
  WebkitMaskImage: 'radial-gradient(circle, black 15%, transparent 40%)',
  maskImage:       'radial-gradient(circle, black 15%, transparent 40%)',
  background: `conic-gradient(
    from 0deg,
    rgba(232, 184, 48, 0.22) 0deg, transparent 8deg,
    transparent 15deg, rgba(232, 184, 48, 0.18) 15deg, transparent 23deg,
    /* …pattern repeats every 30deg, alternating 0.22/0.18 alpha… */
    transparent 360deg
  )`,
};
```
Animated: `motion.div` with `animate={{ rotate: 360 }} transition={{ duration: 60, ease: 'linear', repeat: Infinity }}`.

### 3.6 Victory Two-Layer Bloom (light source)

```ts
const VICTORY_GOLD_BLOOM = {
  position: 'fixed', top: '25%', left: '50%',
  width: 380, height: 380, marginLeft: -190, marginTop: -190,
  borderRadius: '50%',
  background: 'radial-gradient(circle, rgba(232, 184, 48, 0.15) 0%, rgba(232, 184, 48, 0.06) 45%, transparent 70%)',
};
const VICTORY_WHITE_BLOOM = {
  /* same geometry, 200×200 */
  background: 'radial-gradient(circle, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0.06) 40%, transparent 65%)',
};
```

### 3.7 Defeat Vignette (red closing-in)

```ts
{
  position: 'fixed', inset: 0, pointerEvents: 'none',
  background: 'radial-gradient(ellipse at 50% 50%, transparent 25%, rgba(192, 55, 68, 0.12) 55%, rgba(192, 55, 68, 0.25) 85%)',
}
```

### 3.8 Defeat Slashes (SVG dual-stroke)

Each slash is two overlapping lines: thick dark base + thin bright centerline.

```jsx
<svg style={{ position:'fixed', inset:0, opacity:0.2, pointerEvents:'none' }}
     viewBox="0 0 1920 1080" preserveAspectRatio="none">
  <line x1="1350" y1="-50"  x2="400" y2="1130" stroke="#c03744" strokeWidth="40" strokeLinecap="round" opacity="0.7" />
  <line x1="1350" y1="-50"  x2="400" y2="1130" stroke="#ff2244" strokeWidth="8"  strokeLinecap="round" opacity="0.5" />
  <line x1="1500" y1="-30"  x2="550" y2="1110" stroke="#c03744" strokeWidth="32" strokeLinecap="round" opacity="0.6" />
  <line x1="1500" y1="-30"  x2="550" y2="1110" stroke="#ff2244" strokeWidth="6"  strokeLinecap="round" opacity="0.4" />
  <line x1="1650" y1="-70"  x2="700" y2="1150" stroke="#c03744" strokeWidth="44" strokeLinecap="round" opacity="0.5" />
  <line x1="1650" y1="-70"  x2="700" y2="1150" stroke="#ff2244" strokeWidth="10" strokeLinecap="round" opacity="0.4" />
</svg>
```

### 3.9 Tapered Title Wing (gradient line)

Thin horizontal hairlines that fade in toward a centered title.

```ts
{ width: 60, height: 1, background: 'linear-gradient(to right, transparent, rgba(232, 184, 48, 0.5))' }
{ width: 60, height: 1, background: 'linear-gradient(to left,  transparent, rgba(232, 184, 48, 0.5))' }
```

### 3.10 Soft Hairline Divider (gradient fade)

Used inside ChatDock and on the lobby header bottom border.

```jsx
<div aria-hidden style={{
  position: 'absolute', bottom: 0, left: 12, right: 12, height: 1,
  background: 'linear-gradient(90deg, transparent 0%, rgba(154, 154, 168, 0.18) 50%, transparent 100%)',
}} />
```
Vertical version: `linear-gradient(180deg, ...)`, width 1px.

### 3.11 HP Bar — Parallelogram via clip-path (mirrorable)

```ts
const skewLeft  = 'polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)';
const skewRight = 'polygon(0 0, calc(100% - 12px) 0, 100% 100%, 12px 100%)';
```

```jsx
<div className="relative h-7" style={{
  clipPath: mirror ? skewRight : skewLeft,
  background: 'rgba(15, 20, 28, 0.75)',
  border: '0.5px solid rgba(255, 255, 255, 0.08)',
}}>
  <div style={{
    position: 'absolute', top: 0, bottom: 0,
    left: mirror ? 'auto' : 0, right: mirror ? 0 : 'auto',
    width: `${hpPct}%`,
    background: hpColor === 'crimson'
      ? 'linear-gradient(180deg, #aa4c4c 0%, #a04545 55%, #883a3a 100%)'
      : 'linear-gradient(180deg, #648f73 0%, #5a8a6a 55%, #4a7a5a 100%)',
    transition: 'width 300ms ease-out',
  }}>
    {/* leading-edge 1px highlight at the current HP position */}
    <div style={{
      position: 'absolute', top: 0, bottom: 0, width: 1,
      left: mirror ? 0 : 'auto', right: mirror ? 'auto' : 0,
      background: 'rgba(255, 255, 255, 0.22)',
    }} />
  </div>
  {/* HP number — Cinzel italic, tabular-nums, double black shadow for legibility on sprites */}
  <span style={{
    fontFamily: '"Cinzel","Trajan Pro","Noto Serif JP",serif',
    fontStyle: 'italic',
    fontSize: 13, letterSpacing: '0.04em',
    fontFeatureSettings: '"tnum"',
    textShadow: '0 1px 2px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.7)',
  }}>{hp} / {maxHp}</span>
</div>
```

### 3.12 Mitsudomoe Spinner (search/loading/waiting centerpiece)

Three concentric layers with counter-rotation.

```jsx
<div style={{ position:'relative', display:'flex', alignItems:'center', justifyContent:'center', width:320, height:320 }}>
  {/* radial glow */}
  <div style={{
    position:'absolute', width:320, height:320, borderRadius:'50%',
    background:'radial-gradient(circle, rgba(201,162,90,0.18) 0%, rgba(201,162,90,0.08) 35%, rgba(201,162,90,0.03) 60%, transparent 80%)',
  }} />
  {/* counter-rotating hairline ring */}
  <motion.div
    style={{ position:'absolute', width:220, height:220, borderRadius:'50%', border:'1px solid rgba(201,162,90,0.15)' }}
    animate={{ rotate: -360 }} transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
  />
  {/* rotating gold icon, blended into background */}
  <motion.img
    src={mitsudamoeSrc}
    style={{ width:140, height:140, opacity:0.5, mixBlendMode:'screen' }}
    animate={{ rotate: 360 }} transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
  />
</div>
```

### 3.13 Body Zone Silhouette Masking (BodyZoneSelector)

The BodyZoneSelector is the most CSS-heavy element in the app. Highlights:

**Silhouette as mask** (every fill layer is clipped to the silhouette PNG):
```ts
const silhouetteMaskStyle = {
  WebkitMaskImage: `url(${silhouetteSrc})`,
  maskImage:       `url(${silhouetteSrc})`,
  WebkitMaskSize:  '100% 100%',
  maskSize:        '100% 100%',
  WebkitMaskRepeat: 'no-repeat',
  maskRepeat:       'no-repeat',
  WebkitMaskPosition: 'center',
  maskPosition:       'center',
};
```

**Two-layer mask (silhouette × vertical zone gradient)** for per-zone fills:
```ts
{
  WebkitMaskImage: `url(${silhouetteSrc}), ${zoneGradient}`,
  maskImage:       `url(${silhouetteSrc}), ${zoneGradient}`,
  WebkitMaskSize: '100% 100%, 100% 100%',
  maskSize:       '100% 100%, 100% 100%',
  WebkitMaskRepeat: 'no-repeat, no-repeat',
  maskRepeat:       'no-repeat, no-repeat',
  WebkitMaskPosition: 'center, center',
  maskPosition:       'center, center',
  WebkitMaskComposite: 'source-in',
  maskComposite: 'intersect',
}
```

**Dark base body fill with warm edge halo** (drop-shadow on the masked div):
```ts
{
  ...silhouetteMaskStyle,
  background: 'rgb(10, 14, 22)',
  filter: 'drop-shadow(0 0 2px rgba(201, 162, 90, 0.15)) drop-shadow(0 10px 24px rgba(0,0,0,0.6))',
}
```

**Soft warm radial backdrop behind silhouette**:
```ts
{
  inset: '-8% -14%',
  background: 'radial-gradient(58% 55% at 50% 55%, rgba(201,169,97,0.05) 0%, rgba(15,20,25,0) 70%)',
}
```

**Tactical-grid dot pattern with vignette mask**:
```ts
{
  backgroundImage: 'radial-gradient(circle, rgba(201,162,90,0.12) 1px, transparent 1.5px)',
  backgroundSize: '12px 12px',
  WebkitMaskImage: 'radial-gradient(ellipse at center, black 50%, transparent 90%)',
  maskImage:       'radial-gradient(ellipse at center, black 50%, transparent 90%)',
}
```

**Selected zone radial fill** (red for ATTACK, green for BLOCK):
```ts
function zoneFillBackground(rgb: string) {
  return `radial-gradient(ellipse at center, rgba(${rgb}, 0.7) 0%, rgba(${rgb}, 0.3) 60%, rgba(${rgb}, 0) 100%)`;
}
// rgb is '192, 55, 68' for attack or '90, 138, 122' for block
```

**Hover zone fill** (flat alpha, dimmer):
```ts
mode === 'attack' ? 'rgba(192, 55, 68, 0.25)' : 'rgba(90, 138, 122, 0.25)'
```
Always-mounted divs, opacity transitions over 150ms ease.

**SVG outline + glow filter** (selected zones):
```jsx
<filter id="kombats-zone-outline-attack" x="-20%" y="-20%" width="140%" height="140%">
  <feMorphology in="SourceAlpha" operator="dilate" radius="1" result="dilated" />
  <feComposite in="dilated" in2="SourceAlpha" operator="out" result="outline" />
  <feGaussianBlur in="outline" stdDeviation="0.5" result="outlineBlurred" />
  <feFlood floodColor="#c03744" result="flood" />
  <feComposite in="flood" in2="outlineBlurred" operator="in" result="coloredOutline" />
  <feGaussianBlur in="coloredOutline" stdDeviation="4" result="glow" />
  <feMerge>
    <feMergeNode in="glow" />
    <feMergeNode in="coloredOutline" />
  </feMerge>
</filter>
```
Hover variant skips the wider Gaussian glow and uses `floodOpacity="0.5"` instead.

**SVG vertical luminance mask** for outline feathering — paired `<linearGradient>` (white=visible) + `<mask>` per zone.

**Pulse + outline-in keyframes**:
```css
@keyframes kombats-zone-pulse {
  0%, 100% { opacity: 0.8; }
  50%      { opacity: 1; }
}
@keyframes kombats-zone-outline-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
```

### 3.14 Custom Scrollbar

Scoped to `.kombats-scroll` (currently used by chat dock feed and player list).

```css
.kombats-scroll {
  scrollbar-width: thin;
  scrollbar-color: rgba(201, 169, 97, 0.18) transparent;
}
.kombats-scroll::-webkit-scrollbar          { width: 6px; height: 6px; }
.kombats-scroll::-webkit-scrollbar-track    { background: transparent; border-radius: 9999px; }
.kombats-scroll::-webkit-scrollbar-thumb    {
  background-color: rgba(255, 255, 255, 0.08);
  border-radius: 9999px;
  transition: background-color 180ms ease;
}
.kombats-scroll:hover::-webkit-scrollbar-thumb       { background-color: rgba(201, 169, 97, 0.22); }
.kombats-scroll::-webkit-scrollbar-thumb:hover       { background-color: rgba(201, 169, 97, 0.4); }
.kombats-scroll::-webkit-scrollbar-corner            { background: transparent; }
```

### 3.15 Ornament Corner Marks (panel decoration)

Used by `GamePanel ornament` and to claim ATTACK/BLOCK column territory.

```jsx
<>
  <div className="absolute top-0    left-0  w-3 h-3 border-t border-l border-[var(--kombats-moon-silver)]/40" />
  <div className="absolute top-0    right-0 w-3 h-3 border-t border-r border-[var(--kombats-moon-silver)]/40" />
  <div className="absolute bottom-0 left-0  w-3 h-3 border-b border-l border-[var(--kombats-moon-silver)]/40" />
  <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-[var(--kombats-moon-silver)]/40" />
</>
```

`BodyZoneSelector` uses a slimmer variant: 14px arms × 1.5px stroke, semantic color at 0.35 alpha.

### 3.16 Fighter Sprite Drop Shadow

Anchored bottom-left/right, oversized so the sprite bleeds offscreen.

```ts
className: 'h-[82vh] w-auto object-contain drop-shadow-2xl'
style: {
  filter: 'drop-shadow(0 25px 50px rgba(0,0,0,0.9))',
  marginBottom: '-17vh',
}
// Opponent flips visually via outer wrapper:
style: { transform: 'scaleX(-1)', marginBottom: '-17vh' }
// And inner sprite is hue-shifted for a different palette:
style: { filter: 'drop-shadow(0 25px 50px rgba(0,0,0,0.9)) hue-rotate(180deg)' }
```

### 3.17 Avatar Card (onboarding selection)

Selection signaled by opacity contrast + a 2px gold underline (no glow).

```jsx
<button style={{ border: '0.5px solid rgba(255,255,255,0.06)' }}
        className={`group relative block aspect-[2/3] w-full overflow-hidden rounded-md
                    transition-opacity duration-200 focus:outline-none ${
          selected ? 'opacity-100' : 'opacity-55 hover:opacity-90 focus-visible:opacity-90'
        }`}>
  {/* dark gradient fill behind letterbox */}
  <div className="absolute inset-0 bg-gradient-to-b from-[var(--kombats-smoke-gray)]/70 via-[var(--kombats-ink-navy)]/80 to-[var(--kombats-ink-navy)]" />
  <img src={avatar.image} className="absolute inset-0 h-full w-full object-cover"
       style={{ objectPosition: avatar.focal }} />
  {selected && (
    <div className="absolute inset-x-0 bottom-0 h-[2px]"
         style={{ background: '#c9a25a' }} />
  )}
</button>
```

### 3.18 KPI Tile (color-mix for tinted bg+border)

```ts
const toneVar = 'var(--kombats-jade)';  // or crimson
const tileStyle = {
  textAlign: 'center', padding: '6px 0',
  background: `color-mix(in srgb, ${toneVar} 10%, transparent)`,
  border:     `1px solid color-mix(in srgb, ${toneVar} 30%, transparent)`,
  borderRadius: '4px',
};
```

### 3.19 Opponent Sprite Tinting

Mirrored player sprite with a 180° hue rotation produces the opponent's visually distinct palette without a separate asset.

```ts
style: { transform: 'scaleX(-1)', marginBottom: '-17vh' }
// inner img:
style: { filter: 'drop-shadow(0 25px 50px rgba(0,0,0,0.9)) hue-rotate(180deg)' }
```

### 3.20 Battle Log Outcome Pill

Inline color-derived chip — bg/border/text all derived from a single hex with appended alpha hex (`55` ≈ 33%, `14` ≈ 8%).

```jsx
<span style={{
  color, borderColor: `${color}55`, background: `${color}14`,
}} className="text-[9px] uppercase tracking-[0.18em] px-1.5 py-[1px] border rounded-sm">
  {label}
</span>
```

---

## 4. Assets

### 4.1 Backgrounds — `src/assets/backgronds/` (sic)
| File | Purpose |
|------|---------|
| `bamboo.png` | Bamboo grove scene. |
| `blood_moon.png` | Red moon variant. |
| `desert.png` | Desert scene. |
| `dodjo.png` | Dojo interior. |
| `full_moon.png` | Full moon scene. |
| `sakura.png` | Cherry blossom scene. |

Currently in use: `imports/bg-1.png` (the moonlit village shipped from the Figma export). Other backgrounds are alternate scene candidates.

### 4.2 Fighters — `src/assets/fighters/`
| File | Purpose |
|------|---------|
| `female_archer.png` | Avatar option (Kasumi). |
| `female_ninja.png` | Avatar option (Akemi). |
| `ronin.png` | Avatar option (Takeshi) + default. |
| `shadow_assassin.png` | Avatar option (Raiden). |
| `shadow_oni.png` | Avatar option (Shadow). |
| `silhouette.png` | The neutral body silhouette used as the mask source for the BodyZoneSelector. |

Source art is 1024×1536 (2:3 aspect). Card uses the same aspect so the artwork renders 1:1 with no crop and no upscale.

### 4.3 Icons — `src/assets/icons/`
| File | Purpose |
|------|---------|
| `kunai.png` | (currently unused in screens). |
| `mitsudamoe.png` | Three-comma Japanese heraldic glyph used for: loading, queue searching, post-lock-in waiting state, 404 page. |

### 4.4 Imports (raw Figma exports) — `src/imports/`
| File | Purpose |
|------|---------|
| `bg.png`, `bg-1.png` | Lobby/battle background scene. |
| `charackter.png` | Default character sprite used in lobby and battle. |
| `ChatGPT_Image_19_апр…png` | Concept art (not referenced in screens). |
| `pasted_text/` | Misc Figma outputs. |

### 4.5 Fonts
- **Inter** (loaded via Google Fonts, weights 400/500/600/700/800) — body, buttons.
- **Noto Sans JP** (loaded via Google Fonts, same weights) — h1–h6 headings.
- **Cinzel / Trajan Pro / Noto Serif JP / serif** (system fallback chain — NOT loaded as a webfont) — display titles, HP numbers, brand wordmark.
- **Noto Serif JP / Hiragino Mincho ProN / Yu Mincho / serif** — only for the diamond-frame ideogram glyph.

Loaded via:
```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Noto+Sans+JP:wght@400;500;600;700;800&display=swap');
```

---

## 5. Component Visual Patterns

### 5.1 Button — `design-system/primitives/Button.tsx`

Four variants × three sizes.

```ts
SIZE_STYLES = {
  sm: { padding: '6px 14px',  fontSize: '11px' },
  md: { padding: '10px 24px', fontSize: '13px' },
  lg: { padding: '16px 40px', fontSize: '15px' },
};

VARIANT_STYLES = {
  primary:   { background: '#c9a25a',                  color: '#0f1419', border: 'none' },                                // gold fill
  secondary: { background: 'transparent',              color: '#e8e8f0', border: '0.5px solid rgba(255,255,255,0.12)' },  // outline
  ghost:     { background: 'transparent',              color: 'rgba(232,232,240,0.75)', border: 'none' },
  danger:    { background: '#c03744',                  color: '#ffffff', border: 'none' },
};

base = {
  borderRadius: '8px',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'background 150ms ease, border-color 150ms ease, transform 80ms ease',
  whiteSpace: 'nowrap',
}
```

Disabled state: `opacity: 0.5; cursor: 'not-allowed'`.

### 5.2 Panel

```jsx
<div style={{
  background: surface[variant],         // glass / glassDense / glassSubtle / solidAccent
  backdropFilter: 'blur(20px)',         // skipped for solidAccent
  WebkitBackdropFilter: 'blur(20px)',
  border: bordered ? '0.5px solid rgba(255,255,255,0.06)' : 'none',
  borderRadius: radius[r],              // sm / md / lg
  boxShadow: shadow[elevation],         // panel / panelLift / none
}}>{children}</div>
```

### 5.3 Label

Small uppercase caption with tone color.

```jsx
<span style={{
  fontSize: '11px',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  fontWeight: 500,
  color: TONE_COLOR[tone],   // muted | crimson text | jade text | gold text
}}>{children}</span>
```

### 5.4 Divider

```jsx
<div style={{
  borderTop: '1px solid rgba(255,255,255,0.04)',
  marginTop: space[marginY], marginBottom: space[marginY],
  width: '100%',
}} />
```

### 5.5 PanelHeader

Same typography as Label, with `space.sm space.md` padding.

### 5.6 StatBar (generalized HP/XP bar)

```jsx
<div style={{
  position: 'relative', width: '100%', height: 28,
  clipPath: skewed ? (mirror ? 'polygon(0 0, calc(100% - 12px) 0, 100% 100%, 12px 100%)'
                              : 'polygon(12px 0, 100% 0, calc(100% - 12px) 100%, 0 100%)') : undefined,
  background: 'rgba(15,20,28,0.55)',
  border: '0.5px solid rgba(255,255,255,0.06)',
}}>
  <div style={{
    position: 'absolute', top: 0, bottom: 0,
    left: mirror ? 'auto' : 0, right: mirror ? 0 : 'auto',
    width: `${pct}%`,
    background: fillColor,                     // solid color or gradient
    transition: 'width 300ms ease-out',
  }} />
  {showNumbers && (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
      justifyContent: mirror ? 'flex-start' : 'flex-end',
      padding: '0 14px', fontVariantNumeric: 'tabular-nums', fontSize: 13,
      textShadow: '0 1px 2px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.7)',
    }}>{value} / {max}</div>
  )}
</div>
```

### 5.7 TextInput

```jsx
<label style={{
  display: 'block', fontSize: 11, fontWeight: 500,
  letterSpacing: '0.18em', textTransform: 'uppercase',
  color: 'rgba(232,232,240,0.48)', marginBottom: 8,
}}>{label}</label>

<input style={{
  width: '100%', padding: '8px 16px',
  background: 'rgba(0, 0, 0, 0.3)',
  border: `1px solid ${error ? '#c03744' : focused ? 'rgba(201,162,90,0.60)' : 'rgba(255,255,255,0.06)'}`,
  borderRadius: '4px',
  color: '#e8e8f0', fontSize: 14,
  transition: 'border-color 150ms ease',
  outline: 'none',
}} className="placeholder:text-[rgba(232,232,240,0.48)]" />

<div style={{
  display: 'flex', justifyContent: 'space-between', marginTop: 8,
  fontSize: 12, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase',
}}>
  <span style={{ color: error ? '#d04654' : 'rgba(232,232,240,0.48)' }}>{leftMessage}</span>
  <span style={{ color: 'rgba(232,232,240,0.48)', fontVariantNumeric: 'tabular-nums' }}>{helperRight}</span>
</div>
```

### 5.8 TopNavBar — `composed/TopNavBar.tsx`

Full-bleed glass header with reveal-on-hover bottom border.

Surface:
```ts
{
  background: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(15,20,28,0.35) 50%, transparent 100%)',
  borderBottom: `1px solid ${revealed ? 'rgba(201,162,90,0.40)' : 'rgba(255,255,255,0.06)'}`,
  borderRadius: 0,
  transition: 'border-color 300ms ease',
}
```

Content row dim 70% → 100% on hover/focus:
```ts
{ padding: '12px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  opacity: revealed ? 1 : 0.7, transition: 'opacity 300ms ease' }
```

Logo block (diamond frame + wordmark stack):
```jsx
<div style={{ display:'flex', alignItems:'center', gap:12 }}>
  <div style={{
    position:'relative', width:36, height:36,
    display:'flex', alignItems:'center', justifyContent:'center',
    transform:'rotate(45deg)',
    border:'1px solid rgba(201, 162, 90, 0.55)',
    background:'rgba(201, 162, 90, 0.05)',
    boxShadow:'inset 0 0 0 1px rgba(201, 162, 90, 0.08), 0 0 14px rgba(201, 162, 90, 0.18)',
  }}>
    <span style={{
      transform:'rotate(-45deg)', color:'#c9a25a', fontSize:18, lineHeight:1,
      fontFamily:'"Noto Serif JP","Hiragino Mincho ProN","Yu Mincho",serif',
    }}>{glyph}</span>
  </div>
  <div style={{ display:'flex', flexDirection:'column', lineHeight:1 }}>
    <span style={{ fontSize:9, color:'rgba(232,232,240,0.48)', letterSpacing:'0.5em', textTransform:'uppercase' }}>The</span>
    <span style={{
      marginTop:6, fontSize:22, color:'#c9a25a', letterSpacing:'0.34em', lineHeight:1,
      fontFamily:'"Cinzel","Trajan Pro","Noto Serif JP",serif', fontWeight:600,
      textShadow:'0 2px 12px rgba(201, 162, 90, 0.3)',
    }}>KOMBATS</span>
  </div>
</div>
```

NavButton: 11px uppercase 0.18em tracking, muted text → gold on hover/active. Underline grows from 0 to full-width on hover/focus (`absolute bottom-0 h-px bg-gold transition-all duration-300`).

IconAction: padding `p-2`, muted → gold transition.

Vertical divider between nav and right actions: 1px × 20px with `BORDER_SUBTLE_COLOR` background.

### 5.9 ChatDock — `composed/ChatDock.tsx`

170px tall glass panel split 3:1 (chat : players).

Outer:
```jsx
<Panel variant="glass" radius="lg" elevation="panelLift" bordered
       className="pointer-events-auto w-full max-w-5xl"
       style={{ height: 170, overflow: 'hidden' }} />
```

Tab bar: 36px tall row of `ChatTabButton`s. Each button:
- Inactive: muted text. Active: primary text + a gold underline pinned to the bottom (`h-[2px]` rounded-full, gold, `boxShadow: '0 0 10px rgba(201, 169, 97, 0.45)'`).
- Icon flips to gold when active.
- Optional badge — small inline tabular-nums grey number.

Soft hairline below tab bar (gradient transparent→silver18→transparent).

Content area: `kombats-scroll` styled overflow-y-auto.

Footer: either tab-specific node, or rounded pill input:
```ts
{ borderRadius: 9999, padding: '6px 14px', fontSize: 12, background: 'rgba(15, 20, 28, 0.7)' }
```

Right column (players, w-64):
- Vertical soft hairline between columns.
- Header row: gold Users icon + "Players in Chat" muted caption + count.
- Scrollable list of `PlayerRow`s. Each row:
```jsx
<div className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-white/[0.03] transition-colors cursor-pointer">
  <span style={{
    width:6, height:6, borderRadius:9999,
    background: online ? '#5a8a7a' : 'rgba(232,232,240,0.48)',
    boxShadow:  online ? '0 0 6px #5a8a7a' : 'none',  // jade glow when online
  }} />
  <span className="text-xs truncate" style={{ color:'rgba(232,232,240,0.75)' }}>{name}</span>
</div>
```

CSS variables exposed to descendants for Tailwind arbitrary-value usage:
```css
--ds-accent-primary: #c9a25a;
--ds-accent-text:    rgba(201, 162, 90, 0.90);
--ds-text-primary:   #e8e8f0;
--ds-text-secondary: rgba(232, 232, 240, 0.75);
--ds-text-muted:     rgba(232, 232, 240, 0.48);
```

### 5.10 QueueCard — `composed/QueueCard.tsx`

Two states (`ready` / `searching`).

Ready: glass panel with PanelHeader title, big primary "Join Queue" button, divider, "Battle Type" caption + value.

Searching: PanelHeader (accent gold), `MitsudomoeSpinner` (200px / 140px / 88px scaled-down version), elapsed seconds with Clock icon, secondary "Cancel Search" button, divider, "Finding" caption + uppercase gold value.

### 5.11 OnboardingCard — `composed/OnboardingCard.tsx`

Glass panel with centered header (eyebrow + Cinzel title + subtitle), then children separated by `Divider marginY="md"`.

Title:
```ts
{
  fontFamily: '"Cinzel","Trajan Pro","Noto Serif JP",serif',
  fontSize: 22, fontWeight: 600, letterSpacing: '0.28em', textTransform: 'uppercase',
  color: '#c9a25a',
  textShadow: '0 2px 12px rgba(201, 162, 90, 0.3)',
}
```
Eyebrow: 10px / 0.32em tracking / muted.

### 5.12 FighterStatsPopover — `composed/FighterStatsPopover.tsx`

Animated upward pop-out from a fighter nameplate.

```jsx
<motion.div className="absolute left-0 right-0 bottom-full mb-3"
  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
  transition={{ duration: 0.2 }}>
  <Panel variant="glass" radius="md" elevation="panel" bordered style={{ overflow:'hidden' }}>
    <PopoverHeader />   {/* "Fighter Profile" muted | gold rank — flex-direction can mirror */}
    <PopoverBody />     {/* 2-col grid: Attributes list + Record (KPI tiles + aux rows) */}
  </Panel>
</motion.div>
```

Attribute icon colors per `AttributeColor`:
```ts
crimson: 'var(--kombats-crimson)'
gold:    'var(--kombats-gold)'
jade:    'var(--kombats-jade)'
silver:  'var(--kombats-moon-silver)'
```

KPI tile uses `color-mix` (see §3.18). Wins=jade, Losses=crimson.

### 5.13 RewardRow — `composed/RewardRow.tsx`

Glass-subtle panel row, label left + tabular-nums value right.

```jsx
<Panel variant="glassSubtle" radius="sm" elevation="none" bordered style={{
  display:'flex', alignItems:'center', justifyContent:'space-between',
  padding:'8px 16px',
}}>
  <Label tone="neutral">{label}</Label>
  <span style={{ fontSize:14, fontWeight:500, color: TONE_COLOR[tone], fontVariantNumeric:'tabular-nums' }}>{value}</span>
</Panel>
```

Tone colors: neutral=primary text, accent=gold, success=jade text, danger=crimson text.

### 5.14 GameShell — `app/components/GameShell.tsx`

Layered fixed-viewport shell:

```jsx
<div className="relative w-full h-screen overflow-hidden bg-[var(--kombats-ink-navy)]">
  <div className="absolute inset-0 z-0">{children}</div>             {/* scene + center content */}
  <div className="absolute top-0 left-0 right-0 z-30">{header}</div>  {/* TopNavBar */}
  {bottomOverlay && (
    <div className="absolute bottom-4 left-0 right-0 z-30 px-4 flex justify-center items-end gap-3 pointer-events-none">
      {bottomOverlay}
    </div>
  )}
</div>
```

Constants every screen should respect:
```ts
CHAT_DOCK_HEIGHT_PX    = 170;
CHAT_DOCK_SAFE_AREA_PX = 170 + 16 /* bottom-4 */ + 24 /* breathing */ = 210;
```

### 5.15 BattleLogFeed (inside ChatDock "Battle Log" tab)

Per entry: round badge (R1/R2…) + body text + outcome chip.

Chip color is derived from the outcome:
```ts
hit | critical | defeat → 'var(--kombats-crimson)'
blocked | victory       → 'var(--kombats-jade)'
default                 → 'var(--kombats-moon-silver)'
```

Chip styling:
```ts
{ color, borderColor: `${color}55`, background: `${color}14` }
```
Plus 9px / 0.18em tracking / uppercase / px-1.5 py-[1px] / border / rounded-sm.

### 5.16 BodyZoneSelector layout (excluding the masking math)

```jsx
<div style={combatZoneStyle}>           {/* glassSubtle inset, sm radius, subtle border */}
  {isWaiting ? (
    <Mitsudomoe centerpiece, sized to match the silhouette column height />
  ) : (
    <>
      <Column>
        <CornerMark color={attackRed} position="tl" />
        <CornerMark color={attackRed} position="bl" />
        <h3 style={ATTACK_HEADER_STYLE}>ATTACK</h3>          {/* Cinzel 18px, crimson text, crimson glow */}
        <SilhouetteStage mode="attack" ... />
        {attack ? <div style={SELECTION_VALUE_STYLE_ATTACK}>{attack}</div>
                : <div style={SELECTION_PLACEHOLDER_STYLE}>Select zone</div>}
      </Column>
      <Column>
        <CornerMark color={blockGreen} position="tr" />
        <CornerMark color={blockGreen} position="br" />
        <h3 style={BLOCK_HEADER_STYLE}>BLOCK</h3>            {/* Cinzel 18px, jade text, jade glow */}
        <SilhouetteStage mode="block" ... />
        {block ? <div style={SELECTION_VALUE_STYLE_BLOCK}>{block}</div>
               : <div style={SELECTION_PLACEHOLDER_STYLE}>Select pair</div>}
      </Column>
    </>
  )}
</div>
{/* below: action button row — primary "LOCK IN" or disabled "Locked In ✓" */}
```

Header style (per side):
```ts
{
  fontFamily: '"Cinzel","Trajan Pro","Noto Serif JP",serif',
  fontWeight: 600, fontSize: 18, letterSpacing: '0.24em', textTransform: 'uppercase',
  color: semantic.attack.text,            // or block.text
  textShadow: '0 2px 14px rgba(192, 55, 68, 0.35)',  // or jade equivalent
}
```

Selection-value vs. placeholder distinction:
```ts
placeholder = { fontSize:13, color:'rgba(232,232,240,0.48)', fontStyle:'italic', fontWeight:400, letterSpacing:'0.04em' }
value       = { fontSize:13, color: semantic.{attack|block}.text, fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase' }
```

### 5.17 Combat Panel Meta Row

3-col grid that locks the timer dead-center even as left/right widths change.

```ts
{ display:'grid', gridTemplateColumns:'1fr auto 1fr', alignItems:'center', padding:'4px 16px' }
```

Turn indicator dot (gold with glow when your turn, muted when waiting):
```ts
your_turn:    { width:6, height:6, borderRadius:9999, background:'#c9a25a',                 boxShadow:'0 0 8px rgba(201, 169, 97, 0.55)' }
opponent_turn:{ width:6, height:6, borderRadius:9999, background:'rgba(201, 162, 90, 0.60)', boxShadow:'none' }
```

### 5.18 FighterNameplate

Above each fighter sprite. Composition (mirror = right side opponent):
- `FighterStatsPopover` mounted absolutely above.
- Behind the name+bar: a soft elliptical black halo so the text reads on bright scene art:
```ts
{
  inset: '-38px -56px',
  background: 'radial-gradient(ellipse 68% 62% at center, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.38) 48%, rgba(0,0,0,0) 88%)',
  filter: 'blur(22px)',
}
```
- Name (text-2xl, primary text, double black drop shadow `0 2px 8px rgba(0,0,0,0.95), 0 0 20px rgba(0,0,0,0.7)`).
- Row: HP bar + chevron toggle button. Chevron is muted silver → gold on hover with a black drop-shadow filter for legibility.

### 5.19 Result Screen Common Styles

- Title row: tapered wing line + Cinzel 56px title + tapered wing line.
- Subtitle: 12px / 0.24em tracking / muted text.
- Result panel: 520px max-width glass panel with overflow:hidden, top accent line (3px gradient transparent→tone→transparent), padded body.
- 2-col Names grid with role label / name / outcome label per side.
- Reward rows: glassSubtle inset rows with neutral label left, color-coded value right (jade for positive, crimson for negative).
- Final exchange block: padded 8/16, glassSubtle bg, left border 3px tinted (gold 0.3 for victory / crimson 0.4 for defeat), uppercase 11px header + body sentence.
- Two CTAs at bottom: primary action ("Battle Again" / "Try Again") + secondary "Return to Lobby".

---

## 6. Quick Visual-Vocabulary Cheatsheet

| Pattern | Where | One-line recipe |
|---|---|---|
| Glass panel | everywhere | `bg rgba(15,20,28,0.7) + blur(20px) + 0.5px white@6% border + 8/12px radius + panel shadow` |
| Gold ambient glow | login, popovers | `radial-gradient(circle, gold@8% → @3% → transparent)` |
| Cinzel title bloom | brand, results | Cinzel + uppercase + wide tracking + `text-shadow: 0 2px 16px gold@25%` |
| Mitsudomoe spinner | loading, queue, waiting | Radial glow + counter-rotating hairline ring + rotating gold icon (`mix-blend-mode: screen`) |
| HP bar | battle | `clip-path: polygon(...)` + linear gradient + leading-edge 1px highlight + Cinzel italic tabular numbers |
| Body zone fills | battle | Silhouette PNG mask × vertical feather gradient mask, composited with intersect |
| Selected zone outline | battle | SVG `feMorphology dilate → feComposite out → feFlood → feGaussianBlur` |
| Victory rays | victory | Conic-gradient with 24 alternating gold beams, masked to a small radial halo, rotating 60s |
| Defeat vignette | defeat | `radial-gradient(ellipse, transparent 25% → crimson@12% 55% → crimson@25% 85%)` |
| Defeat slashes | defeat | SVG: 3 dual-stroke diagonals (thick crimson base + thin bright-red centerline), opacity 0.2 |
| Soft hairline | dividers | `linear-gradient(transparent → silver@18% → transparent)` 1px |
| Diamond logo | brand | Rotated 45° square with gold border + glow, counter-rotated -45° glyph inside |
| Tactical grid | silhouette bg | `radial-gradient(circle, gold@12% 1px, transparent 1.5px)` 12px tile + radial vignette mask |
| Avatar selection | onboarding | Opacity 0.55 → 1 + 2px gold underline (no glow) |
| Custom scrollbar | chat dock | `.kombats-scroll` 6px thumb, gold@22% on hover |
