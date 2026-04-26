# Battle Log Analysis — Chat Tab Integration

Snapshot of the existing battle-log ("narration feed") data flow, taken from
the current `design` branch. No code was changed. All citations use
`path:line` form.

---

## 1. Single Battle Log Entry — `BattleFeedEntry`

This is the unit the entire pipeline produces and consumes. Identical shape on
the wire (SignalR + HTTP) and in the client store.

### TypeScript (frontend) — `src/Kombats.Client/src/types/battle.ts:175`

```ts
export interface BattleFeedEntry {
  key: string;              // "{battleId}:{turnIndex}:{sequence}" — server-built dedup key
  battleId: Uuid;           // string
  turnIndex: number;        // 0-based; END_OF_BATTLE_TURN_INDEX (2147483647) for end-of-battle entries
  sequence: number;         // 0..N within a single turn (A→B = 0, B→A = 1, commentary = 2)
  kind: FeedEntryKind;
  severity: FeedEntrySeverity;
  tone: FeedEntryTone;
  text: string;             // fully rendered narration string (placeholders already substituted)
}

export interface BattleFeedUpdate {   // SignalR push payload — one batch per event
  battleId: Uuid;
  entries: BattleFeedEntry[];
}

export interface BattleFeedResponse { // HTTP GET response — full battle feed
  battleId: Uuid;
  entries: BattleFeedEntry[];
}
```

`Uuid` and `DateTimeOffset` are aliases from `src/Kombats.Client/src/types/common.ts`
(both string-typed at runtime).

### Backend mirror — `src/Kombats.Bff/Kombats.Bff.Application/Narration/Feed/BattleFeedEntry.cs:3`

```csharp
public sealed record BattleFeedEntry
{
    public required string Key { get; init; }
    public required Guid   BattleId { get; init; }
    public required int    TurnIndex { get; init; }
    public required int    Sequence { get; init; }
    public required FeedEntryKind     Kind { get; init; }
    public required FeedEntrySeverity Severity { get; init; }
    public required FeedEntryTone     Tone { get; init; }
    public required string Text { get; init; }
}
```

Key built deterministically in
`src/Kombats.Bff/Kombats.Bff.Application/Narration/DefaultFeedAssembler.cs:22`:
`Key = $"{battleId}:{turnIndex}:{sequence}"`.

### Notable absences

- **No `timestamp` / `createdAt` / `occurredAt` field on the entry.** Ordering
  is purely `(turnIndex, sequence)`. See section 5 for the full timestamp
  story.
- **No author / sender ID.** Attacker/defender names are baked into `text`
  during template rendering on the BFF.
- **No structured payload.** `damage`, `zone`, etc. are not carried on the
  entry — only the rendered string. The raw mechanical data lives on
  `TurnResolvedRealtime.log` (a separate, parallel event), not here.

---

## 2. Entry Kinds, Severities, Tones

### `FeedEntryKind` (17 values)

Frontend: `src/Kombats.Client/src/types/battle.ts:33`. Backend:
`src/Kombats.Bff/Kombats.Bff.Application/Narration/Feed/FeedEntryKind.cs:3`.

| Group | Kinds |
|---|---|
| Per-attack outcomes (one per direction, A→B and B→A) | `AttackHit`, `AttackCrit`, `AttackDodge`, `AttackBlock`, `AttackNoAction` |
| Battle lifecycle | `BattleStart`, `BattleEndVictory`, `BattleEndDraw`, `BattleEndForfeit`, `DefeatKnockout` |
| Commentary (commentator policy, sequence 2 of a turn or end-of-battle) | `CommentaryFirstBlood`, `CommentaryMutualMiss`, `CommentaryStalemate`, `CommentaryNearDeath`, `CommentaryBigHit`, `CommentaryKnockout`, `CommentaryDraw` |

There is **no generic "system message" kind**. Anything that is not a combat
outcome or commentary uses one of the lifecycle kinds. There are also no
"round start" / "round end" kinds — turn boundaries are implicit in the
`turnIndex` jump between successive entries.

### `FeedEntrySeverity` (3 values) — `FeedEntrySeverity.cs:3`

`Normal | Important | Critical`. Drives the left-border color in
`NarrationFeed` (`severityBorderColor`,
`src/Kombats.Client/src/modules/battle/components/NarrationFeed.tsx:79`).

### `FeedEntryTone` (6 values) — `FeedEntryTone.cs:3`

`Neutral | Aggressive | Defensive | Dramatic | System | Flavor`. Drives the
text color/style (`toneTextClass`, `NarrationFeed.tsx:91`).

### Outcome → kind mapping (BFF, attack entries)

`src/Kombats.Bff/Kombats.Bff.Application/Narration/NarrationPipeline.cs:262`
`ResolveAttackCategory`:

| `AttackOutcomeRealtime` | Kind |
|---|---|
| `NoAction` | `AttackNoAction` |
| `Dodged` | `AttackDodge` |
| `Blocked` | `AttackBlock` |
| `Hit` | `AttackHit` |
| `CriticalHit` / `CriticalBypassBlock` / `CriticalHybridBlocked` | `AttackCrit` |

---

## 3. How the Data Arrives

The narration feed is **generated on the BFF**, not on the Battle service.
Battle emits raw mechanical events; the BFF's `BattleHubRelay` and
`NarrationPipeline` translate those into `BattleFeedEntry`s and push them
to the client.

### 3a. SignalR push — `BattleFeedUpdated`

Event name constant:
`src/Kombats.Bff/Kombats.Bff.Application/Relay/BattleHubRelay.cs:28`
`public const string BattleFeedUpdatedEvent = "BattleFeedUpdated";`

Payload: `BattleFeedUpdate { battleId, entries: BattleFeedEntry[] }`.

Three triggers, all in `BattleHubRelay.cs`:

| Trigger | Pipeline call | Typical entry count |
|---|---|---|
| `JoinBattle` succeeds (start of battle) — `BattleHubRelay.cs:285` | `GenerateBattleStartFeed` | 1 (`BattleStart`, sequence 0, turnIndex 0) |
| Downstream `TurnResolved` arrives — `BattleHubRelay.cs:118` | `GenerateTurnFeed` | 2–3 per turn: A→B (seq 0), B→A (seq 1), optional commentary (seq 2) |
| Downstream `BattleEnded` arrives — `BattleHubRelay.cs:162` | `GenerateBattleEndFeed` | 1–3 (defeat + result + optional commentary) at `turnIndex = int.MaxValue` |

The raw `TurnResolved` / `BattleEnded` events are **also** relayed to the
client unchanged (BattleHubRelay relays raw first, then sends the derived
`BattleFeedUpdated`). The client handles both:

- Raw `TurnResolved` → `useBattleStore.handleTurnResolved` (sets
  `lastResolution`, drives the per-turn animation panel).
- `BattleFeedUpdated` → `useBattleStore.handleFeedUpdated` (appends to
  `feedEntries`).

Client wiring:
`src/Kombats.Client/src/transport/signalr/battle-hub.ts:171` registers
`conn.on('BattleFeedUpdated', …)`, dispatched into the store via
`src/Kombats.Client/src/modules/battle/hooks.ts:69` (`onBattleFeedUpdated`).

### 3b. Store accumulation — `useBattleStore.handleFeedUpdated`

`src/Kombats.Client/src/modules/battle/store.ts:269` — appends new entries,
**dedupes by `entry.key`**, and trims to `MAX_FEED_ENTRIES = 500`
(`store.ts:107`). So the store is the running buffer; reconnect mid-battle
will see incoming entries deduped against what is already there.

### 3c. HTTP backfill — `GET /api/v1/battles/{battleId}/feed`

Endpoint:
`src/Kombats.Bff/Kombats.Bff.Api/Endpoints/BattleFeed/GetBattleFeedEndpoint.cs:14`.
Returns `BattleFeedResponse { battleId, entries: BattleFeedEntry[] }`.

Implementation: BFF calls Battle's history endpoint, then runs the same
deterministic `NarrationPipeline.GenerateFullBattleFeed(history)`
(`NarrationPipeline.cs:165`) to regenerate the entire feed from persisted
turn data. Because keys are `(battleId, turnIndex, sequence)`-derived, every
HTTP entry will collide-by-key with whatever the live SignalR push delivered
— this is intentional.

Client side: `transport/http/endpoints/battle.ts:4` `getFeed(battleId)`,
consumed by
`src/Kombats.Client/src/modules/battle/result-feed.ts:13`
`useResultBattleFeed` (TanStack Query, `staleTime: Infinity`, used post-battle
on `BattleResultScreen`). Live + HTTP entries are merged and sorted by
`(turnIndex, sequence)` in
`src/Kombats.Client/src/modules/battle/feed-merge.ts:22` `mergeFeeds`.

### Summary

- **During battle:** SignalR push only. One `BattleFeedUpdated` per event,
  carrying 1–3 entries.
- **After battle (result screen):** the live store buffer is merged with one
  HTTP backfill so refreshing the page gives a complete log.

---

## 4. Where It Is Currently Rendered

### `NarrationFeed` — defined but not yet mounted in any screen

File: `src/Kombats.Client/src/modules/battle/components/NarrationFeed.tsx`.

Repo-wide search (`grep -n "NarrationFeed"`) finds the symbol **only inside
its own file** (definition, props interface, header literal "Battle Log") —
no screen, layout, or shell currently composes it. The component exists
ready-to-use but is unused at runtime. This makes it a clean target to drop
into a chat-tab without first having to extract it from another layout.

### Visual structure (current implementation)

```
<section> (glass-subtle panel, rounded, blurred backdrop, scroll-on-overflow)
  <header>
    "Battle Log"  // gold uppercase eyebrow, font-display, letter-spacing 0.24em
  </header>
  <ul>
    <FeedRow … /> per entry
  </ul>
</section>
```

`FeedRow` (`NarrationFeed.tsx:152`) renders each entry as:

- A 2px left border whose color comes from `severity` (`Critical` → crimson,
  `Important` → gold, `Normal` → subtle).
- Header row: `T{turnIndex}` mono label (hidden for end-of-battle entries
  where `turnIndex === END_OF_BATTLE_TURN_INDEX = 2147483647`), plus an
  optional outcome chip whose label/color come from `kind`
  (Hit/Critical/Blocked/Dodged/Start/Victory/Draw/Forfeit/Defeat).
- Body: the raw `entry.text`, styled by `tone`
  (Aggressive→crimson, Defensive→jade, Dramatic→accent italic, System→mono
  muted, Flavor→italic secondary, Neutral→secondary).

Auto-scroll: a `useEffect` watching the tail entry's
`${key}:${sequence}` signal scrolls the container to the bottom on each
append (`NarrationFeed.tsx:32`).

### Data sources the component accepts

```ts
interface NarrationFeedProps {
  entries?: readonly BattleFeedEntry[];
  fill?: boolean;
}
```

If `entries` is omitted it defaults to the live store via `useBattleFeed()`
(`hooks.ts:171`, a thin `useBattleStore(s => s.feedEntries)` selector). For
the post-battle/result use case you would pass
`useResultBattleFeed(battleId).entries` explicitly (which already merges
store + HTTP).

### Other consumer

`BattleResultScreen` (`screens/BattleResultScreen.tsx:190`) calls
`useResultBattleFeed` but only to extract a **single** entry for a celebration
subtitle (`lastTurnEntry`, line 166) — it does not render the feed list. So
`NarrationFeed` itself has no live rendering site today.

---

## 5. Timestamps

**There is no timestamp on a `BattleFeedEntry`, and none per turn on the feed
side.** The frontend type, the BFF record, and both wire envelopes
(`BattleFeedUpdate`, `BattleFeedResponse`) all lack any time field. Ordering
is `(turnIndex, sequence)` only.

The only nearby wall-clock values, all on **other** events:

- `TurnOpenedRealtime.deadlineUtc` (`types/battle.ts:99`) — turn deadline,
  not a turn-start time.
- `BattleEndedRealtime.endedAt` (`types/battle.ts:164`) — battle-end wall
  time, not per-entry.
- `BattleSnapshotRealtime` carries no timestamps either.

Consequence for chat-tab integration: if the design wants "log at HH:MM:SS"
labels in the chat tab, that data is **not currently available** — it would
either (a) need to be synthesized client-side on receipt (acceptable for
"received-at" semantics, but lost on HTTP backfill / refresh), or (b) require
a backend change to add a timestamp to `BattleFeedEntry`.

---

## Cross-reference: file paths

| Concern | Path |
|---|---|
| Frontend types | `src/Kombats.Client/src/types/battle.ts` |
| Store + handler | `src/Kombats.Client/src/modules/battle/store.ts` (`handleFeedUpdated` at L269, `MAX_FEED_ENTRIES=500` at L107) |
| Hook selector | `src/Kombats.Client/src/modules/battle/hooks.ts:171` `useBattleFeed` |
| HTTP merge hook | `src/Kombats.Client/src/modules/battle/result-feed.ts:13` `useResultBattleFeed` |
| Pure merge | `src/Kombats.Client/src/modules/battle/feed-merge.ts` (incl. `END_OF_BATTLE_TURN_INDEX = 2147483647`) |
| Render component | `src/Kombats.Client/src/modules/battle/components/NarrationFeed.tsx` |
| SignalR client | `src/Kombats.Client/src/transport/signalr/battle-hub.ts` (`'BattleFeedUpdated'` at L171) |
| HTTP client | `src/Kombats.Client/src/transport/http/endpoints/battle.ts` |
| BFF entry record | `src/Kombats.Bff/Kombats.Bff.Application/Narration/Feed/BattleFeedEntry.cs` |
| BFF kind enum | `src/Kombats.Bff/Kombats.Bff.Application/Narration/Feed/FeedEntryKind.cs` |
| BFF severity / tone enums | `src/Kombats.Bff/Kombats.Bff.Application/Narration/Feed/FeedEntrySeverity.cs`, `FeedEntryTone.cs` |
| BFF push pipeline | `src/Kombats.Bff/Kombats.Bff.Application/Narration/NarrationPipeline.cs` |
| BFF assembler (key format) | `src/Kombats.Bff/Kombats.Bff.Application/Narration/DefaultFeedAssembler.cs:22` |
| BFF SignalR relay | `src/Kombats.Bff/Kombats.Bff.Application/Relay/BattleHubRelay.cs` |
| BFF HTTP endpoint | `src/Kombats.Bff/Kombats.Bff.Api/Endpoints/BattleFeed/GetBattleFeedEndpoint.cs` |
