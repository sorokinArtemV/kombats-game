# Kombats Frontend Flow Feasibility Validation

## 1. Purpose

This document validates every significant frontend requirement from `02-client-product-and-architecture-requirements.md` against the actual Kombats backend codebase and BFF integration layer. The goal is to determine, requirement by requirement, whether the desired frontend behavior is supported by the current backend before frontend architecture begins.

This is not a restatement of requirements. It is an evidence-based assessment of what the current code actually supports, where it diverges from requirements, and what must be resolved.

---

## 2. Inputs reviewed

| Input | Status |
|-------|--------|
| `docs/frontend/01-backend-revision-for-frontend.md` | Read in full |
| `docs/frontend/02-client-product-and-architecture-requirements.md` | Read in full |
| `src/Kombats.Bff/Kombats.Bff.Api` | All endpoints, hub, middleware, DTOs inspected |
| `src/Kombats.Bff/Kombats.Bff.Application` | Service clients, relay, narration pipeline, game state composer inspected |
| `src/Kombats.Bff/Kombats.Bff.Bootstrap` | Program.cs auth config, DI, SignalR setup inspected |
| `src/Kombats.Battle/Kombats.Battle.Domain` | BattleZone enum, BattleEngine, Ruleset, EndBattleReason inspected |
| `src/Kombats.Battle/Kombats.Battle.Application` | ActionIntakeService, BattleTurnAppService, BattleLifecycleAppService inspected |
| `src/Kombats.Battle/Kombats.Battle.Infrastructure` | BattleHub, SignalRBattleRealtimeNotifier, recovery workers inspected |
| `src/Kombats.Battle/Kombats.Battle.Realtime.Contracts` | All realtime DTOs inspected |
| `src/Kombats.Matchmaking` | Queue handlers, Redis stores, pairing worker, timeout worker inspected |
| `src/Kombats.Players/Kombats.Players.Domain` | Character entity, OnboardingState, LevelingPolicyV1 inspected |
| `src/Kombats.Players/Kombats.Players.Application` | All handlers including BattleCompleted consumer inspected |

---

## 3. Validation method

Each requirement was traced from the BFF endpoint or SignalR hub method through to the downstream service implementation. Classification uses:

- **Confirmed by code**: Behavior directly observable in source code with file path and line reference.
- **Inferred from flow**: Behavior follows logically from confirmed code paths but is not explicitly tested.
- **Depends on Keycloak configuration**: Behavior controlled by external identity provider settings, not Kombats code.
- **Partially supported**: Some aspects work, others have gaps or caveats.
- **Unsupported / backend gap**: Current code does not support this behavior.
- **Requirements document error**: The requirements document contains incorrect information that conflicts with actual code.

---

## 4. Executive summary

The core game loop (authenticate → onboard → lobby → queue → battle → result → lobby) is **fully supported** by the current backend and BFF layer with three categories of exception:

**Critical corrections needed in requirements document:**
1. **Battle zones are wrong.** The requirements document specifies 6 zones (`Head`, `Torso`, `LeftArm`, `RightArm`, `LeftLeg`, `RightLeg`). The actual codebase uses **5 zones in a ring topology**: `Head`, `Chest`, `Belly`, `Waist`, `Legs`. This is not a minor naming difference — it is a different combat model.
2. **Block zone adjacency constraint is undocumented.** Block zones must be adjacent pairs in the ring: Head-Chest, Chest-Belly, Belly-Waist, Waist-Legs, Legs-Head. Non-adjacent pairs are silently treated as NoAction.
3. **Zone parsing is case-insensitive**, not case-sensitive as stated in the requirements. (`Enum.TryParse` with `ignoreCase: true` in `ActionIntakeService.cs:81`.)

**Backend gaps (require backend change for full support):**
1. Win/loss record not exposed in BFF API responses.
2. Queue auto-leave on browser close is not supported server-side.

**Design-safe areas:** Authentication flow, startup/recovery, onboarding, lobby display, matchmaking polling, battle connection/events/reconnection, post-battle flow, and reskin architecture are all feasible with the current backend.

---

## 5. Requirement-by-requirement validation

### REQ-S1: Startup state resolution
**Classification: Supported as-is**

`GET /api/v1/game/state` returns `GameStateResponse` with `Character`, `QueueStatus`, `IsCharacterCreated`, and `DegradedServices`. Confirmed in `GetGameStateEndpoint.cs` and `GameStateComposer.cs`. The response contains all fields needed for startup routing.

### REQ-S2: Active battle reconnection
**Classification: Supported as-is**

When `QueueStatus.Status == "Matched"` with a `BattleId`, the frontend connects to `/battlehub` and calls `JoinBattle(battleId)`. The returned `BattleSnapshotRealtime` includes `Phase` (enum: `ArenaOpen=0`, `TurnOpen=1`, `Resolving=2`, `Ended=3`). Confirmed in `BattleHub.cs` (BFF) and `BattleSnapshotRealtime.cs`. The snapshot includes all state needed for any phase, including `EndedReason` for ended battles.

### REQ-S3: Matchmaking recovery
**Classification: Supported as-is**

`QueueStatus.Status == "Searching"` is returned when the player's Redis status is in Searching state. Confirmed in `GetQueueStatusHandler.cs`. Frontend resumes polling.

### REQ-S4: Onboarding recovery
**Classification: Supported as-is**

`Character.OnboardingState` is returned as `"Draft"`, `"Named"`, or `"Ready"` (mapped from int in `OnboardingStateMapper.cs`). Each state maps to a specific onboarding step.

### REQ-S5: Degraded service handling
**Classification: Supported as-is**

`GameStateComposer.cs` catches `ServiceUnavailableException` independently for Players and Matchmaking. If one service is down, the other's data is still returned. `DegradedServices` is a string array with service names. If both are down, returns 503. Confirmed at lines 29-48 of `GameStateComposer.cs`.

### REQ-S6: Authentication failure recovery
**Classification: Supported with frontend-only implementation**

401 responses are returned by all BFF endpoints when JWT is invalid/expired. The BFF does not handle token refresh. Frontend must implement token lifecycle and redirect to login on 401.

### REQ-S7: Token lifecycle
**Classification: Supported with frontend-only implementation**

BFF uses stateless JWT validation via Keycloak. Token refresh is entirely a frontend responsibility using Keycloak's OIDC refresh token flow. HTTP uses `Authorization: Bearer` header; SignalR uses `?access_token=` query parameter. Confirmed in `Program.cs` lines 42-56.

### REQ-S8: Register and Login as client entry points
**Classification: Supported as-is (depends on Keycloak configuration)**

See Section 6 below for detailed analysis.

### REQ-O1: Onboarding is a hard gate
**Classification: Supported as-is**

The BFF does not enforce onboarding completion server-side for endpoint access (a player in Draft state can call queue endpoints). However, the Matchmaking service requires `IsReady` combat profile to join queue (`JoinQueueHandler.cs`), effectively blocking non-Ready players from gameplay. The frontend must enforce the hard gate for navigation.

**Caveat:** The gate is enforced by the frontend reading `OnboardingState` from `GET /api/v1/game/state`. A malicious client could call queue endpoints directly but would fail at the Matchmaking service level due to combat profile validation.

### REQ-O2: Onboarding steps
**Classification: Supported as-is with one correction**

- **Step 1 (Name selection):** `POST /api/v1/character/name` with `{ Name: string }`. Name validation: 3-16 characters (confirmed in `Character.SetNameOnce()` line 73 and `SetCharacterNameRequestValidator.cs`). Server enforces uniqueness. Returns 409 on duplicate. Name is one-time-set (confirmed: `SetNameOnce` method, `NameAlreadySet` error).
- **Step 2 (Stat allocation):** `POST /api/v1/character/stats` with `{ ExpectedRevision, Strength, Agility, Intuition, Vitality }`. Starting stats: 3/3/3/3 with 3 unspent points. Allocation is additive. Confirmed in `Character.CreateDraft()` and `Character.AllocatePoints()`.

**Note:** BFF validation allows name up to 50 characters (`SetCharacterNameRequestValidator.cs`), but domain enforces 3-16 (`Character.SetNameOnce()` line 73). The domain validation is authoritative; the BFF validator is looser. Frontend should validate 3-16.

### REQ-O3: Onboarding step recovery
**Classification: Supported as-is**

`OnboardingState` persists in Postgres. `Draft` → name selection, `Named` → stat allocation. Confirmed by `OnboardingState` enum and `GET /api/v1/game/state` returning the current state.

### REQ-O4: Character identity is server-derived
**Classification: Supported as-is**

`POST /api/v1/game/onboard` is idempotent. Creates character using JWT `sub` claim as `IdentityId`. No user ID input needed. Confirmed in `EnsureCharacterExistsHandler.cs`.

### REQ-L1: Lobby screen
**Classification: Supported partially / with caveats**

`GET /api/v1/game/state` returns: CharacterId, Name, Strength, Agility, Intuition, Vitality, UnspentPoints, Level, TotalXp, OnboardingState, Revision. This covers all MUST and SHOULD fields **except wins/losses** (see DES-3 validation below).

### REQ-L2: Stat allocation from lobby
**Classification: Supported as-is**

`POST /api/v1/character/stats` works for both onboarding and post-onboarding allocation. `UnspentPoints > 0` after level-ups is non-blocking. Confirmed: `Character.AllocatePoints()` accepts both `Named` and `Ready` states (lines 86-89).

### REQ-L3: Enter matchmaking
**Classification: Supported as-is**

`POST /api/v1/queue/join` returns `QueueStatusResponse`. 409 when already matched includes match details. Matchmaking service validates `IsReady` combat profile. Confirmed in `JoinQueueHandler.cs`.

### REQ-L4: Matchmaking searching state
**Classification: Supported as-is**

Poll-based via `GET /api/v1/queue/status`. No push notification. `POST /api/v1/queue/leave` for cancellation. Confirmed: no SignalR hub for matchmaking exists anywhere in the codebase.

### REQ-L5: Matchmaking state transitions
**Classification: Supported partially / with caveats**

| Documented status | Code behavior | Notes |
|---|---|---|
| `Searching` | Confirmed | Redis status `Searching` |
| `Matched` with `BattleId` | Confirmed | `BattleId` populated when match reaches `BattleCreateRequested` or later |
| `Matched` without `BattleId` | **Unlikely in practice** | `BattleId` is set at match creation time in `ExecuteMatchmakingTickHandler.cs`; it's generated before the CreateBattle command is sent. The frontend may never see Matched without BattleId. |
| `Idle` / `NotQueued` after timeout | Confirmed | BFF maps null status to `"Idle"` (`GetQueueStatusEndpoint.cs` line 21). Matchmaking returns `NotQueued` when Redis TTL expires. |
| `TimedOut` (MatchState) | Confirmed | `MatchTimeoutWorker` marks stale matches as TimedOut. `MatchState: "TimedOut"` visible in status response. |

**Caveat on "Matched without BattleId":** The requirements document lists this as a state the frontend must handle. In practice, the `BattleId` is a pre-generated GUID assigned at match creation time before the CreateBattle command is sent (`ExecuteMatchmakingTickHandler.cs`). The BattleId will be present from the moment the match is created. The "preparing battle" interim state may be unnecessary, but implementing it defensively is harmless.

### REQ-L6: Cancel matchmaking
**Classification: Supported as-is**

`POST /api/v1/queue/leave` returns `LeaveQueueResponse` with `LeftQueue: bool`, `MatchId?`, `BattleId?`. When already matched, returns `LeftQueue: false` with match details. Confirmed in `LeaveQueueHandler.cs`.

### REQ-L7: Automatic battle transition
**Classification: Supported with frontend-only implementation**

The transition is entirely frontend-driven: detect `Matched` + `BattleId` in polling response → connect to `/battlehub` → call `JoinBattle`. No backend coordination needed.

### REQ-B1: Battle connection
**Classification: Supported as-is**

SignalR connection to `/battlehub` with JWT as `?access_token=`. `JoinBattle(battleId)` returns `BattleSnapshotRealtime` with full state. Confirmed in `BattleHub.cs` (BFF) lines 23-39.

### REQ-B2: Server-authoritative state model
**Classification: Supported as-is**

All combat resolution is server-side. `BattleStateUpdated` is the authoritative sync point. `JoinBattle` always returns current state. Confirmed throughout `BattleTurnAppService.cs`.

### REQ-B3: Turn input and submission
**Classification: Requirements document error — must be corrected**

**CRITICAL DISCREPANCY: Zone values are wrong in the requirements.**

The requirements state zone values: `"Head"`, `"Torso"`, `"LeftArm"`, `"RightArm"`, `"LeftLeg"`, `"RightLeg"` (6 zones).

The actual `BattleZone` enum (`BattleZone.cs` lines 7-14):
```
Head = 0
Chest = 1
Belly = 2
Waist = 3
Legs = 4
```

This is **5 zones in a ring topology**, not 6 body-part zones. The combat model is fundamentally different from what the requirements describe.

**Additional undocumented constraint: block zone adjacency.** Block zones must be adjacent pairs in the ring (`BattleZoneHelper.IsValidBlockPattern()`, `BattleZone.cs` lines 24-31):
- Head ↔ Chest
- Chest ↔ Belly
- Belly ↔ Waist
- Waist ↔ Legs
- Legs ↔ Head (wraps around)

Non-adjacent block pairs are silently treated as NoAction (`ActionIntakeService.cs` line 135).

**Case sensitivity correction:** The requirements state zone values are "case-sensitive." In fact, `ActionIntakeService.cs` line 81 uses `Enum.TryParse<BattleZone>(attackZoneStr, ignoreCase: true, ...)`. Zone parsing is **case-insensitive**.

**actionPayload as JSON string:** Confirmed. `SubmitTurnAction(Guid battleId, int turnIndex, string actionPayload)` — the third parameter is a string. Frontend must `JSON.stringify()` the action object. Confirmed in `BattleHub.cs` (BFF) line 41.

### REQ-B4: Client-side action validation
**Classification: Supported with frontend-only implementation — but validation rules must be corrected**

The client must validate:
- All three zones selected (attack, blockPrimary, blockSecondary)
- Zone values are valid `BattleZone` enum strings: `Head`, `Chest`, `Belly`, `Waist`, `Legs`
- **Block zones must be an adjacent pair in the ring topology**
- Submission before deadline

The requirements document's validation rules are based on incorrect zone values and do not mention adjacency.

### REQ-B5: Turn submission is fire-and-forget
**Classification: Supported as-is**

`SubmitTurnAction` returns `Task` (void). No confirmation. Next signal is `TurnResolved` or deadline expiry. Confirmed in `BattleHub.cs` line 41 and `BattleHubRelay.SubmitTurnActionAsync()`.

### REQ-B6: Event processing
**Classification: Supported as-is**

All listed events confirmed in `RealtimeEventNames.cs` and `SignalRBattleRealtimeNotifier.cs`:
- `BattleReady`, `TurnOpened`, `TurnResolved`, `PlayerDamaged`, `BattleStateUpdated`, `BattleEnded` — relayed through BFF
- `BattleFeedUpdated` — generated by BFF narration pipeline
- `BattleConnectionLost` — sent by BFF when downstream connection drops (`BattleHubRelay.cs` line 228)

### REQ-B7: Event ordering
**Classification: Supported as-is**

Confirmed ordering in `BattleTurnAppService.CommitAndNotifyTurnContinued()` lines 482-526:
1. `PlayerDamaged` (0-2 instances)
2. `TurnResolved`
3. `TurnOpened` (next turn) OR `BattleEnded`
4. `BattleStateUpdated`
5. `BattleFeedUpdated` (best-effort, may lag)

### REQ-B8: Battle end handling
**Classification: Supported as-is**

`BattleEndReasonRealtime` enum confirmed (`BattleEndReasonRealtime.cs`): `Normal=0`, `DoubleForfeit=1`, `Timeout=2`, `Cancelled=3`, `AdminForced=4`, `SystemError=5`, `Unknown=99`.

`WinnerPlayerId` on `BattleEndedRealtime` is nullable (`Guid?`), confirmed. Null for draws and DoubleForfeit.

**NoActionLimit:** Configured as 10 consecutive mutual NoAction turns in `appsettings.json` line 49, not 3 as previously estimated.

### REQ-B9: Battle reconnection
**Classification: Supported as-is**

On SignalR reconnect, client calls `JoinBattle(battleId)` again. Returns full current snapshot. No event replay (confirmed: `BattleHubRelay.JoinBattleAsync()` creates a new downstream connection and returns snapshot only). If battle ended during disconnect, snapshot shows `Phase: Ended`. Confirmed in `BattleHub.cs` (Battle service) lines 32-54.

### REQ-B10: Mid-battle browser close
**Classification: Supported as-is**

Battle continues server-side. Turns resolve as NoAction. On reopen, `GET /api/v1/game/state` shows active battle. Startup recovery (REQ-S2) reconnects to battle. Confirmed by battle lifecycle and recovery service architecture.

### REQ-B11: Narration feed
**Classification: Supported as-is**

`BattleFeedUpdated` events include `BattleFeedEntry` with `Kind`, `Severity`, `Tone`, `Text`. All enum values confirmed in narration model files. Narration generated by BFF's `NarrationPipeline`.

### REQ-B12: Combat resolution details
**Classification: Supported as-is with one correction**

`TurnResolutionLogRealtime` confirmed with `AtoB` and `BtoA` `AttackResolutionRealtime` entries. Each includes `AttackZone`, `DefenderBlockPrimary`, `DefenderBlockSecondary`, `Outcome`, `Damage`, `WasBlocked`, `WasCrit`.

**Correction:** `AttackOutcomeRealtime` enum values are: `NoAction`, `Dodged`, `Blocked`, `Hit`, `CriticalHit`, `CriticalBypassBlock`, `CriticalHybridBlocked`. These match the requirements.

### REQ-P1: Result screen
**Classification: Supported as-is**

`BattleEnded` event provides outcome. `GET /api/v1/battles/{battleId}/feed` provides full narration. "Finish Battle" is frontend-only navigation back to lobby.

### REQ-P2: Post-battle state refresh
**Classification: Supported partially / with caveats**

`GET /api/v1/game/state` returns updated character data. XP is awarded asynchronously via `BattleCompleted` integration event → Players service `HandleBattleCompletedCommand`. Winner gets 10 XP, loser gets 5 XP (confirmed in `HandleBattleCompletedCommand.cs` lines 22-23). The delay is non-deterministic (depends on message bus latency). Frontend retry-after-delay strategy is the only option. See Section 11.

### REQ-P3: Post-battle feed endpoint
**Classification: Supported as-is**

`GET /api/v1/battles/{battleId}/feed` confirmed in `GetBattleFeedEndpoint.cs`. Returns `BattleFeedResponse` with `BattleId` and `Entries[]`. Deterministic and idempotent. `Key` field (`{battleId}:{turnIndex}:{sequence}`) supports deduplication.

### REQ-P4: Re-entering the game loop
**Classification: Supported as-is**

No cooldown or delay. After dismissing result screen, frontend calls `GET /api/v1/game/state` (no active battle) → lobby → can immediately join queue. Match status clears when battle completes (`MatchState: Completed`).

### REQ-NF1–NF8: Non-functional requirements
**Classification: Supported with frontend-only implementation**

All non-functional requirements (responsiveness, performance, error visibility, connection state, timer accuracy, state consistency, graceful degradation, auth transport) are frontend implementation concerns. The backend provides all necessary data: `traceId` in error responses, `DeadlineUtc` for timers, `DegradedServices` for degradation, and `Revision` for concurrency.

### REQ-R1–R5: Reskin-oriented architecture
**Classification: Supported with frontend-only implementation**

See Section 8 (reskin analysis) for backend constraints.

---

## 6. Authentication and registration feasibility

### Current backend state

- BFF uses Keycloak JWT Bearer authentication. Authority and audience configured in `Program.cs`.
- No registration endpoint exists in BFF or Players service.
- Character creation is lazy via `POST /api/v1/game/onboard` (idempotent, creates from JWT `sub` claim).
- All endpoints require `[Authorize]` except `/health`.

### Registration flow feasibility

**Login redirect:** Fully feasible. The client redirects to `{keycloak-authority}/protocol/openid-connect/auth` with standard OIDC parameters. After successful login, Keycloak redirects back with an authorization code. The client exchanges this for tokens. No Kombats backend involvement.

**Registration redirect:** Feasible if Keycloak realm has self-registration enabled. The Keycloak login page includes a "Register" link when self-registration is active. Alternatively, the client can link directly to `{keycloak-authority}/protocol/openid-connect/registrations` (Keycloak's registration URL).

**Post-registration behavior:** Depends entirely on Keycloak realm configuration:
- If the realm does not require email verification: user returns authenticated immediately after registration.
- If email verification is required: user must verify email first, then log in separately.
- The client can implement both paths (immediate return + login fallback) without knowing realm config upfront, as specified in REQ-S8.

### What is outside Kombats code validation

| Concern | Where it lives |
|---|---|
| Self-registration enabled | Keycloak realm settings (`registrationAllowed: true`) |
| Email verification required | Keycloak realm settings (`verifyEmail` flag) |
| Post-registration redirect behavior | Keycloak realm/client configuration |
| Password policy | Keycloak realm settings |
| Social login providers | Keycloak identity provider config |

### Verdict

Registration and login redirects are fully feasible as a frontend-only implementation using standard OIDC flows. The only prerequisite is Keycloak realm configuration for self-registration. No Kombats backend changes needed.

---

## 7. Startup and recovery feasibility

### GET /api/v1/game/state — confirmed complete

The `GameStateComposer` calls Players and Matchmaking in parallel. Response structure confirmed:

```
GameStateResponse:
  Character: CharacterResponse | null
  QueueStatus: QueueStatusResponse | null
  IsCharacterCreated: bool
  DegradedServices: string[] | null
```

### Recovery routing — confirmed complete

| Condition | Detection | Action |
|---|---|---|
| Active battle | `QueueStatus.Status == "Matched"` + `BattleId != null` | Reconnect to battle via SignalR |
| Active matchmaking | `QueueStatus.Status == "Searching"` | Resume matchmaking polling |
| Incomplete onboarding | `Character.OnboardingState != "Ready"` | Force onboarding step |
| No special state | All above are false | Show lobby |

**Priority order:** The requirements specify battle > matchmaking > onboarding > lobby. This is correct and fully supportable from the response data.

### Degraded service recovery

If Players is degraded: `Character` is null, `IsCharacterCreated` unknown. Frontend cannot determine onboarding state. Should show degraded UI.

If Matchmaking is degraded: `QueueStatus` is null. Frontend cannot determine queue state. Character data still available; lobby can show character info but queue actions should be disabled.

Both degraded: BFF returns 503. Frontend shows full error state.

### Verdict

Startup and recovery are **fully supported as-is**. No backend changes needed.

---

## 8. Onboarding feasibility

### Hard gate enforcement

**Server-side:** Matchmaking service validates `IsReady` combat profile before allowing queue join. Non-Ready players are blocked from gameplay at the service level.

**Frontend-side:** Must additionally enforce navigation lock (no lobby, no queue access) when `OnboardingState != "Ready"`. This is a frontend-only implementation.

### Step recovery

| OnboardingState | Step | Endpoint |
|---|---|---|
| `Draft` | Name selection | `POST /api/v1/character/name` |
| `Named` | Stat allocation | `POST /api/v1/character/stats` |
| `Ready` | Complete | Proceed to lobby |

All states persist in Postgres. Recovery after browser close confirmed by `GET /api/v1/game/state` returning current `OnboardingState`.

### Name validation discrepancy

The BFF's `SetCharacterNameRequestValidator.cs` validates max length as 50. The domain's `Character.SetNameOnce()` validates 3-16. The domain is authoritative. If the frontend sends a 20-character name, it will pass BFF validation but fail at the Players domain layer with a `DomainException("InvalidName")`.

**Frontend should validate 3-16 characters** to match domain rules.

### Stat allocation semantics

Confirmed additive. `Character.AllocatePoints()` adds values to existing stats and deducts total from `UnspentPoints`. Starting stats: 3/3/3/3 with 3 unspent points. Frontend must present a "spend X points" UI, not "set total to Y."

### Verdict

Onboarding is **fully supported as-is**. Frontend must enforce the hard gate (navigation lock), validate name as 3-16 characters, and present additive stat allocation.

---

## 9. Lobby and matchmaking feasibility

### Lobby display

All required fields available from `GET /api/v1/game/state`:
- Name, Level, TotalXp, Strength, Agility, Intuition, Vitality, UnspentPoints ✓
- Wins/Losses: **NOT available** (see Section 13)

### Queue join/leave

- `POST /api/v1/queue/join` → `QueueStatusResponse` with `Status: "Searching"` or `"AlreadyMatched"` ✓
- `POST /api/v1/queue/leave` → `LeaveQueueResponse` with `LeftQueue`, `MatchId`, `BattleId` ✓
- 409 on already-matched: BFF maps to `QueueStatusResponse` with match details ✓

### Polling-based matchmaking

Confirmed: no SignalR channel for matchmaking anywhere in the codebase. HTTP polling is the only mechanism. `GET /api/v1/queue/status` returns `QueueStatusResponse`. Recommended interval: 1-2 seconds.

### Matched-without-BattleId state

The requirements specify handling `Matched` without `BattleId` as "preparing battle." In practice, `BattleId` is a pre-generated GUID assigned at match creation time in `ExecuteMatchmakingTickHandler.cs` before the CreateBattle command is sent. The frontend will likely never observe this state. Implementing the handler defensively is fine but probably unnecessary.

### Queue timeout

Queue entries in Redis have a 30-minute TTL (`StatusTtlSeconds: 1800` in `MatchmakingRedisOptions.cs`). When the TTL expires, `GET /api/v1/queue/status` returns `"Idle"`. The frontend should detect the transition from `Searching` to `Idle` and inform the player.

### Match creation timeout

`MatchTimeoutWorker` runs every 5 seconds. Marks matches as `TimedOut` if stuck in `BattleCreateRequested` for 60 seconds or `BattleCreated` for 10 minutes. Frontend sees `MatchState: "TimedOut"` on next status poll.

### Verdict

Lobby and matchmaking are **fully supported as-is** except for wins/losses display (backend gap).

---

## 10. Battle and reconnect feasibility

### Battle connection

SignalR connection to `/battlehub` with JWT as `?access_token=` query parameter. `JoinBattle(battleId)` returns `BattleSnapshotRealtime`. Confirmed and working.

### Server-authoritative state

All combat resolution is domain-layer server-side. `BattleStateUpdated` is authoritative sync point. No client-side computation needed or allowed.

### Turn submission — REQUIRES CORRECTIONS TO REQUIREMENTS

**Critical: Zone values must be corrected.** The actual zones are:
- `Head`, `Chest`, `Belly`, `Waist`, `Legs` (5 zones, ring topology)

**Critical: Block adjacency constraint must be documented.** Valid block pairs (either order):
- Head ↔ Chest
- Chest ↔ Belly
- Belly ↔ Waist
- Waist ↔ Legs
- Legs ↔ Head

The frontend must present block zone selection as **adjacent pair selection**, not arbitrary two-zone selection. This fundamentally affects the battle UI design: the frontend should present 5 valid block patterns, not allow free selection of any two zones.

**Case sensitivity:** Zone parsing is case-insensitive (`ignoreCase: true`). The requirements incorrectly state it is case-sensitive.

**Deadline grace period:** 1 second after `DeadlineUtc` (`ActionIntakeService.cs` line 191). Submissions within the grace window are accepted. The frontend should still apply a local buffer (1-2 seconds before displayed deadline) as the requirements suggest.

### Event handling

All events confirmed. Ordering confirmed. `BattleFeedUpdated` is best-effort and may lag. All event DTOs have defined shapes in `Kombats.Battle.Realtime.Contracts`.

### Reconnection

On SignalR reconnect, call `JoinBattle(battleId)` again. Returns current snapshot. No event replay. If `Phase == Ended`, show result screen directly. Battle continues server-side regardless of client connection.

### Mid-battle browser close

Battle continues. Turns resolve as NoAction. On reopen, startup recovery detects active battle and reconnects. Confirmed.

### NoAction and DoubleForfeit

`NoActionLimit` is configured as **10** (not 3) in `appsettings.json`. After 10 consecutive turns where both players submit NoAction, battle ends with `DoubleForfeit`. The `NoActionLimit` is included in the `BattleRulesetRealtime` snapshot sent to the client, so the frontend can display the limit.

### Verdict

Battle flow is **fully supported as-is** but the requirements document contains critical errors about zone values and constraints that must be corrected before frontend implementation.

---

## 11. Post-battle feasibility

### XP/level timing

XP is awarded asynchronously via `BattleCompleted` integration event consumed by `HandleBattleCompletedCommand` in the Players service. Winner gets 10 XP, loser gets 5 XP. Each level grants 1 unspent stat point.

The delay between `BattleEnded` (received by client via SignalR) and XP being applied to the character is non-deterministic. It depends on:
1. Outbox flush in Battle service (immediate after SaveChanges)
2. RabbitMQ message delivery
3. Players service consumer processing

Typical delay: sub-second in normal conditions. However, it is not guaranteed.

### Result screen XP display

**Cannot reliably show XP on the result screen immediately.** The `BattleEnded` event does not include XP amounts. The frontend would need to poll `GET /api/v1/game/state` after a delay. This is acknowledged in the requirements (REQ-P2) with the retry-after-delay strategy.

**Alternative:** The frontend knows the XP constants (10 for winner, 5 for loser) from the requirements. It could display expected XP without waiting for the backend update. However, this couples the frontend to backend XP constants, which is fragile.

**Recommended approach:** Show battle outcome on result screen. Show XP/level changes after lobby refresh, with a retry if first fetch shows no change. This is what the requirements already suggest.

### Post-battle feed

`GET /api/v1/battles/{battleId}/feed` returns the complete deterministic narration feed. Available immediately after battle ends (generated by BFF from battle history, not dependent on async processing). Confirmed.

### Verdict

Post-battle flow is **supported with the caveat** that XP display on the result screen is best-effort and may require lobby refresh. This is already acknowledged in the requirements.

---

## 12. Queue-disconnect behavior validation

### Desired behavior (DES-1)

If the player closes the browser while searching, they should leave the queue.

### Current backend reality

**There is no server-side mechanism to detect client disconnection during matchmaking.** Confirmed by thorough inspection:

1. **No persistent connection during matchmaking.** Matchmaking is poll-based HTTP only. The BFF's `/battlehub` SignalR connection is for active battles, not matchmaking. There is no WebSocket or long-lived connection to detect client departure.

2. **No heartbeat for queued players.** No TTL refresh mechanism on queue entries. The Redis status has a fixed 30-minute TTL set at join time.

3. **Queue cleanup happens only via:**
   - Explicit `POST /api/v1/queue/leave` call (requires player action)
   - Redis TTL expiration (30 minutes)
   - Match timeout (if matched while absent)

### What the frontend can do

**Best-effort: `beforeunload` event.** The frontend can call `POST /api/v1/queue/leave` in a `beforeunload` or `pagehide` event handler. This is unreliable because:
- `beforeunload` HTTP requests may be dropped by the browser (especially async requests)
- `navigator.sendBeacon()` only supports POST with limited payload but could work for a fire-and-forget leave
- Mobile browsers may not fire the event at all
- Tab crashes don't trigger the event

**Best-effort: `visibilitychange` event.** The frontend could leave the queue when the tab becomes hidden. More reliable than `beforeunload` but changes the product behavior (leaving queue on tab switch).

### What would require a backend change

- **Heartbeat-based TTL:** Queue entries could require periodic refresh (e.g., every 30 seconds). If the frontend stops refreshing, the entry expires quickly. This would require changes to `RedisPlayerMatchStatusStore` and `RedisMatchQueueStore`.
- **SignalR channel for matchmaking:** A persistent connection would enable server-side disconnect detection. This is a larger architectural change.

### Realistic assessment

**Queue auto-leave on browser close cannot be guaranteed.** The best the frontend can achieve is:
- `navigator.sendBeacon()` on `pagehide` calling the leave endpoint — works ~80% of the time
- Accepting the 30-minute TTL as the fallback — the player gets matched while absent, battle times out or ends in DoubleForfeit, and recovery handles the rest

The product consequence of a "ghost queued" player is mitigated by existing mechanisms:
1. If matched while absent, the battle eventually ends in DoubleForfeit (10 consecutive mutual NoAction turns, ~5 minutes at 30s per turn)
2. Recovery workers clean up orphaned battles
3. On next app open, startup recovery handles whatever state exists

### Verdict

**Best-effort frontend behavior only.** The frontend can attempt `navigator.sendBeacon()` on `pagehide`, but cannot guarantee queue leave on browser close. The 30-minute TTL is the de facto auto-leave. A backend heartbeat mechanism would improve this but is not strictly required for MVP — the existing recovery mechanisms handle the worst case.

---

## 13. Backend changes required

| # | Change | Severity | Requirement | Details |
|---|---|---|---|---|
| BC-1 | **Expose Wins/Losses in BFF API** | Low-Medium | DES-3, REQ-L1 (SHOULD) | `Wins` and `Losses` exist on the domain entity and in `CharacterStateResult`, but `MeResponse` (Players API) and `CharacterResponse` (BFF API) do not include them. Requires adding fields to both DTOs. |
| BC-2 | **Queue heartbeat/timeout mechanism** (optional) | Low | DES-1 | Would reduce ghost-queued player window from 30 minutes to heartbeat interval. Not MVP-blocking; recovery mechanisms handle the fallback. |

No other backend changes are required for the core game loop.

---

## 14. Frontend-only implementation notes

| Area | What the frontend must implement | Backend dependency |
|---|---|---|
| OIDC auth flow | Token acquisition, storage, refresh, and injection | Keycloak (external) |
| Onboarding hard gate | Navigation lock for non-Ready states | Reads `OnboardingState` from game state |
| Matchmaking polling loop | 1-2s interval poll of `GET /api/v1/queue/status` | None |
| Auto-transition to battle | Detect `Matched` + `BattleId` → connect SignalR | None |
| Block zone adjacency validation | Present only valid adjacent pairs to player | Uses `BattleZone` ring topology |
| Turn timer with buffer | Display deadline minus ~1-2 seconds | Reads `DeadlineUtc` from server |
| Fire-and-forget turn submission UI | Show "submitted" indicator locally | No server confirmation exists |
| SignalR reconnection with backoff | Exponential backoff, `JoinBattle` on reconnect | None |
| Post-battle XP refresh with retry | Poll game state with short delay after battle end | None |
| Queue leave on browser close | `navigator.sendBeacon()` best-effort | None |
| Token refresh before expiry | Proactive OIDC refresh token flow | Keycloak (external) |

---

## 15. Ambiguities and unresolved points

### V-1: Keycloak realm configuration for registration
**Status: Outside Kombats code validation.** The client can implement both paths (immediate authenticated return and login fallback). Keycloak realm must have `registrationAllowed: true`. This is a deployment configuration, not a code change.

### V-2: Turn deadline grace period
**Status: Resolved.** 1-second grace buffer confirmed in `ActionIntakeService.cs` line 191. Frontend should apply a local buffer of 1-2 seconds.

### V-3: Stat allocation semantics
**Status: Resolved.** Additive allocation confirmed. `Character.AllocatePoints()` adds values to existing stats.

### V-4: Name permanence
**Status: Resolved.** Names are one-time-set. `SetNameOnce()` method with `NameAlreadySet` error. Frontend should warn player.

### V-5: `OnboardingState: "Unknown"` handling
**Status: Resolved.** `OnboardingStateMapper.ToDisplayString()` maps `_ => "Unknown"` for any unrecognized integer value. This should not occur in practice (only three values: 0, 1, 2 exist in the enum). Frontend can treat `"Unknown"` as an error condition requiring re-login or retry.

### V-6: Concurrent session handling
**Status: Acceptable risk.** Two tabs: stat allocation gets 409 on revision mismatch (handled gracefully). Two SignalR connections to same battle: both receive events, both can submit actions (last submission wins per turn). Two matchmaking polls: harmless (idempotent reads). No single-session enforcement needed for MVP.

### V-7: Post-battle XP timing
**Status: Resolved as non-deterministic.** Typical sub-second but not guaranteed. Frontend should use retry-after-delay on lobby refresh.

### V-8: SignalR reconnection after battle ended during disconnect
**Status: Resolved.** `JoinBattle` returns snapshot with `Phase: Ended`. No event replay. Frontend must check phase immediately after join and route to result screen if ended.

### NEW: Zone values and adjacency constraint
**Status: Requirements document error. Must be corrected before frontend architecture.**

The requirements document (`02-client-product-and-architecture-requirements.md`) contains incorrect zone values in REQ-B3 and REQ-B4. The actual zones are `Head`, `Chest`, `Belly`, `Waist`, `Legs` (5 zones, ring topology) with block adjacency constraints. This fundamentally affects battle UI design.

### NEW: BFF name validation mismatch
**Status: Minor.** BFF validates max 50 characters; domain validates 3-16. Frontend should validate 3-16 to match domain. Not blocking.

---

## 16. Final feasibility verdict

The core game loop is **feasible with the current backend**. No backend changes are required for the primary flow. Two corrections to the requirements document are critical before frontend architecture begins.

### Decision table

#### 1. Safe to design now

| Area | Rationale |
|---|---|
| Authentication and registration flow | Standard OIDC, no backend dependency |
| Startup state resolution and routing | `GET /api/v1/game/state` provides all needed data |
| Onboarding flow (name + stats) | Fully supported, all edge cases handled |
| Lobby screen layout | All required fields available |
| Matchmaking polling UX | Poll-based, well-defined status transitions |
| Battle connection and reconnection | SignalR hub fully functional |
| Battle event processing and state sync | All events and DTOs confirmed |
| Result screen and post-battle flow | BattleEnded event + feed endpoint confirmed |
| Narration feed display | Feed structure and metadata fully defined |
| Error handling and degraded states | Error format and DegradedServices confirmed |
| Reskin-oriented architecture separation | No backend constraints prevent this |
| Token lifecycle management | Standard OIDC, frontend-only |

#### 2. Safe to design with caveats

| Area | Caveat |
|---|---|
| **Battle turn submission UI** | **Must use corrected zone values** (`Head`, `Chest`, `Belly`, `Waist`, `Legs`) **and block adjacency constraints**. Do not design based on the 6-zone model in the requirements document. |
| Post-battle XP/level display | XP is async; design for delayed availability with retry. Do not assume immediate XP on result screen. |
| Win/loss display | Not available in current API. Design lobby to accommodate these fields but do not depend on them for MVP. Can be added as a simple BFF change later. |
| Queue leave on browser close | Best-effort only (`sendBeacon`). Design UX to accommodate the possibility that the player returns to an active search or an unexpected match. |
| Matched-without-BattleId state | Likely never occurs in practice, but design defensively (show "preparing battle" briefly). |

#### 3. Must be resolved before architecture / implementation

| Item | What must happen | Who |
|---|---|---|
| **Correct zone values in requirements document** | Update REQ-B3 and REQ-B4 with actual zones: `Head`, `Chest`, `Belly`, `Waist`, `Legs`. Document block adjacency ring constraint. Remove references to `Torso`, `LeftArm`, `RightArm`, `LeftLeg`, `RightLeg`. | Requirements author |
| **Correct case-sensitivity claim** | Update REQ-B3 to state zone parsing is case-insensitive. | Requirements author |
| **Confirm Keycloak self-registration is enabled** | Verify realm config has `registrationAllowed: true` and determine post-registration behavior (immediate auth return vs. email verification). | DevOps / platform team |
| **Decide on BFF name length validation** | Either update BFF validator to match domain (3-16) or accept the current gap (domain rejects > 16 anyway). Frontend will validate 3-16 regardless. | Backend team (minor) |
