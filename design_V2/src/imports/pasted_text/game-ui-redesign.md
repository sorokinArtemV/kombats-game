Create these game screens from scratch in the new project using the new UI kit / new design file as the visual source of truth.

Important:
- Do NOT reuse the old screen layouts as a structural base.
- Do NOT “reskin” the old dashboard/cards interface.
- The old project should be treated only as functional reference for what screens/states exist.
- This must feel like a real game interface, not a website admin panel or debug layout.

Main goal
Transform the current product structure into a real game UI with strong visual focus on characters, combat, atmosphere, and gameplay clarity.

Overall UI direction
- premium dark anime fighting game UI
- atmospheric, cinematic, immersive
- unified background scene across screens
- elegant overlays instead of boxed website cards
- game-first composition
- the interface must feel like an actual PvP game client
- use the new UI kit / design file as the style foundation

Important style note
- Do not make the interface too sharp/boxy/angular
- Slightly round the corners of buttons, frames, and UI containers
- Only slightly: restrained soft rounding, not bubbly/mobile/casual
- Think refined sci-fi/fantasy game UI, not hard-edged admin dashboard

Global layout principles
- use a shared full-screen background scene
- remove the “separate card blocks” feeling
- use transparent / semi-transparent overlays
- visually prioritize:
  1. character presence
  2. battle actions / main CTA
  3. important state info like HP
- chat and secondary utility areas should be visually subordinate
- avoid dashboard composition
- avoid large empty card containers

Character presentation rule
Do NOT use large player profile cards like the old interface.

Instead:
- use character overlays integrated into the scene
- show character art / portrait / silhouette presence
- default visible combat information should be minimal and strong
- HP should be the main visible stat under or near the character
- other stats should be hidden by default and shown only through a small “show stats / hide stats” interaction or side panel
- focus should stay on character image, HP, and battle state, not raw tables of stats

Need these screens

1. Main Hub / Lobby
Purpose:
- this is the main game screen before queueing
- from here the player sees their character presence, can queue, access settings, and see chat/community presence

Problems in the old version:
- it feels like cards on a webpage
- the upper main area is not visually dominant enough
- the chat area and hub area feel too similarly weighted
- the player panel feels like a debug profile card

Redesign requirements:
- make the upper central area clearly the primary game hub area
- this must feel like “main game screen”, not “dashboard home”
- use the shared background and overlay composition
- player presence should be shown as an in-world overlay, not a giant card
- show character name and HP clearly
- stats should be optional via toggle, not always exposed in a big list
- the Join Queue CTA should feel important and game-like
- chat should exist, but be visually secondary
- online players should exist, but also be secondary
- visually separate the main play/hub zone more clearly from the lower chat/social zone
- overall composition should feel immersive and intentional

2. Queue / Searching Screen
Purpose:
- player is waiting for opponent
- this is a focused waiting state

Requirements:
- redesign it from scratch in the new style
- keep it minimal, focused, and elegant
- preserve the idea of a pulsing waiting indicator
- keep the timer
- keep a clear Cancel action
- make it feel like a tense matchmaking state, not a loading screen from a generic app
- strong central focus, minimal noise
- use the same background language and overlay styling as the rest of the game

3. Battle Screen
Purpose:
- this is the main combat screen
- must visually prioritize the fighters and the action selection

Problems in the old version:
- it uses placeholder-like profile cards
- action selection is too spread out horizontally
- too much attention goes to stat panels and side structure instead of fighters and combat choices
- it still feels like a layout grid, not a combat scene

Redesign requirements:
- use character overlays, not profile cards
- characters should feel integrated into the scene
- under each fighter show HP clearly as the primary persistent stat
- additional stats should be hidden by default and available optionally via side toggle / show-hide control
- the action selection UI (attack + block) must be visually centered and concentrated, not stretched awkwardly across the screen
- the player’s attention should go first to:
  1. the two fighters
  2. the turn timer / combat state
  3. the action selection panel
- the combat action area should feel like a central command overlay
- battle log and chat should be subordinate to the main action
- preserve gameplay readability
- the design should feel like a real fighting game interface, not a prototype layout

4. Victory Screen
Purpose:
- this appears after winning
- it should replace the action-selection area conceptually
- it is a celebratory battle resolution state

Requirements:
- do NOT make it look like the current generic result panel
- place it in the main central combat UI zone
- it can be wider and more dramatic than the action panel
- use victorious visual language:
  - green tones, gold tones, prestige accents, celebratory iconography, banners, victory motifs, etc.
- make it feel rewarding and game-like
- the player should be able to:
  - review battle log / result details
  - return to lobby
  - optionally queue again immediately
- this should feel like “you won a duel”, not “status updated”

5. Defeat Screen
Purpose:
- this appears after losing
- similar structure to victory screen, but emotionally different

Requirements:
- same central placement strategy as victory screen
- use defeat visual language:
  - crimson / dark red / muted danger tones
  - defeat iconography / broken crest / loss motif if appropriate
- it should still look polished and intentional, not like an error panel
- the player should be able to:
  - review battle log / result details
  - return to lobby
  - optionally queue again
- must feel like a proper loss state in a fighting game

Design constraints
- preserve product clarity and usability
- do not overload screens with decorative clutter
- keep UI readable on desktop
- keep the design cohesive across all screens
- use the new UI kit as the style foundation
- do not produce plain website cards
- do not produce a debug/admin interface
- do not expose full stat blocks by default in the main layout
- default emphasis must stay on character art/overlay, HP, state, and main actions

Output expectation
Create fresh screen designs for:
- Main Hub / Lobby
- Queue / Searching
- Battle
- Victory
- Defeat

These should be new game-first compositions in the new project style, not lightly edited copies of the old layouts.