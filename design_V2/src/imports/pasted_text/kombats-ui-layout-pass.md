A focused UI/layout correction pass is needed for the Kombats client.

Context
- The current UI is closer to the intended direction now, but several important layout/composition problems remain.
- This is not a broad redesign request.
- This is a targeted visual/layout correction pass for the existing lobby, matchmaking, battle, and result screens.
- The desired direction is already visible in the current UI and in the provided UI kit / screenshots:
  - large character art
  - strong moonlit background composition
  - dark translucent overlays
  - gold accent
  - clean combat readability
- Keep the same overall product direction.
- Do not invent a new style.

General instruction
The visual emphasis must be:
1. character art
2. HP / combat readability
3. clean aligned overlays
4. persistent shell elements (header + chat)

Do not treat this as tiny CSS polish.
This is a layout/composition correction pass.

What must change

1. Lobby screen
Current issues:
- character image is too small
- character card is too small / too weak
- header is not used as a full-width top shell
- queue overlay is not visually aligned with the character/info block
- chat is too detached and underpowered
- battle-type label is wrong/too generic

Required lobby changes:
- Add a full-width header across the top of the screen
- The header should use the same dark translucent overlay language as the character info card
- Include a control to collapse/minimize the header if that helps keep the scene clean
- Enlarge the player character art significantly:
  - it should occupy roughly at least one-third of the screen height visually
  - it should be aligned toward the left side, not floating too small near center
- Make the player info/stat card larger and more important
- The player card must include:
  - name
  - level
  - HP bar clearly visible and placed higher / more prominently
  - stats: Strength, Agility, Intuition, Endurance
  - expandable/lower section for wins and losses
- The queue/action overlay must be visually aligned with the player block
- The queue/action overlay itself should be centered better and feel compositionally intentional, not detached
- Replace generic “players” wording with battle type wording; current type is “fist fight” / unarmed / equivalent label instead of “players”
- Chat must remain visible on the lobby screen
- Chat should span the width of the lower screen shell
- Chat must also show online users
- If a single oversized chat block becomes too heavy, split chat into two sections/tabs:
  - General
  - DM

2. Matchmaking / searching screen
Current guidance:
- The current searching screen is broadly okay
- But header and chat must NOT disappear

Required matchmaking changes:
- Preserve the header during queue/searching
- Preserve the chat during queue/searching
- Do not collapse the shell into an isolated loading/searching-only composition
- Searching state should feel like a state of the lobby shell, not a separate stripped-down screen

3. Battle screen
Current issues:
- character art is still too small
- HP/readability is not emphasized enough
- action block is too wide for its information density
- header and chat disappear even though they should remain part of the shell

Required battle changes:
- Make both fighters significantly larger
- Character art and HP must become the primary visual focus
- Use the same style language for stat overlays as the improved lobby player card
- HP bars must be much more readable and visually prominent
- Keep the battle screen idea/composition overall, but shift emphasis strongly toward:
  - characters
  - HP
  - immediate combat state
- Reduce the width of the action/decision block roughly by about half if that still preserves readability
- The action block currently wastes too much horizontal space
- Keep header visible during battle
- Keep chat visible during battle
- Do not let shell elements disappear across battle state transitions

4. Victory / defeat screen
Current guidance:
- The general result composition is good
- But it still needs shell consistency and one missing function

Required result changes:
- Keep header visible
- Keep chat visible
- Add an option to view the battle log
- Remove win streak from the reward card/result card
- Keep the overall victory/defeat composition because it is already working better than the other screens

Layout/system constraints
- Keep the same visual theme and atmosphere
- Reuse the same overlay language across header, character info, queue card, battle overlays, and result card
- Align major blocks intentionally; avoid floating detached cards
- Preserve gameplay readability
- Do not let chat or header vanish between lobby / searching / battle / result unless there is a very strong reason
- This should feel like one coherent product shell across states

Implementation expectations
1. Review the current relevant screens/components first
2. Identify the exact files/components to update
3. Apply the layout changes in bounded scope
4. Do not do unrelated architecture cleanup
5. Do not invent new product flows
6. Keep working logic intact while correcting layout and shell consistency

Screens/components likely affected
At minimum inspect and update the real client implementation for:
- lobby shell/screen
- matchmaking/searching screen
- battle shell/screen
- result screen
- header
- chat/sidebar/chat panel composition
- player info/stat card components if they need expansion

Required output
Return:
1. what screens/components were updated
2. what layout changes were made for each screen
3. what was intentionally preserved
4. any place where you could not fully match the requested composition and why

Definition of done
Done means:
1. Lobby has large left-aligned character art, stronger player card, aligned queue card, persistent header, persistent chat
2. Searching keeps the same shell with header + chat
3. Battle has much larger fighters, more prominent HP, narrower action block, persistent header, persistent chat
4. Result screen keeps header + chat, adds battle-log access, removes win streak
5. The app feels visually consistent across these states instead of looking like disconnected screens