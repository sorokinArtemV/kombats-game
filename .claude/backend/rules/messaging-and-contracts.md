# Messaging and Contracts

## MassTransit Configuration

MassTransit version: **8.3.0**. Pinned. Do not upgrade. No other version. This applies to all packages: `MassTransit`, `MassTransit.RabbitMQ`, `MassTransit.EntityFrameworkCore`, `MassTransit.Abstractions`.

All services use `Kombats.Messaging` for MassTransit configuration. No per-service messaging setup divergence. Legacy messaging configurations (`Kombats.Shared/Messaging`, per-service `MessageBusExtensions`, `Kombats.Infrastructure.Messaging`) are replaced by the target `Kombats.Messaging`, not extended.

---

## Transactional Outbox (AD-01)

All event and command publication goes through the MassTransit EF Core transactional outbox. No exceptions.

- Never call `IPublishEndpoint.Publish()` or `ISendEndpoint.Send()` outside a transactional outbox scope
- The outbox ensures atomicity: domain write + event publication succeed or fail together
- Each service's DbContext must include outbox and inbox table mappings
- Direct publish/send outside outbox is the highest-severity production risk (RISK-S1)

---

## Inbox / Consumer Idempotency

All consumers use the MassTransit inbox for idempotent message processing. Duplicate messages must be no-ops.

Each consumer must also be independently idempotent beyond the inbox — the inbox is a safety net, not a substitute for correct logic.

---

## Consumer Rules

- Consumers are thin: deserialize message → call application handler → return
- No domain logic in consumers
- Consumers must handle all expected message shapes including edge cases (e.g., null `WinnerIdentityId` on draws)
- Each consumer must have an idempotency test (same message twice, second is no-op) and a behavior test

---

## Contract Rules

Contract projects contain only plain C# types: records, enums, interfaces. Zero NuGet dependencies.

### Versioning (AD-06)
- All integration events carry a `Version: int` field
- Schema evolution is additive-only — new fields added, existing fields never removed or renamed
- Breaking changes require a new event type
- No schema registry — compile-time project references provide type safety

### Language (AD-02)
- Contracts use the publisher's domain language
- Example: `Vitality` (Players' term) in contracts, not `Stamina` (Battle's term)
- Consumers translate internally

### Known Contracts

| Contract | Publisher | Consumers |
|---|---|---|
| `PlayerCombatProfileChanged` | Players | Matchmaking |
| `CreateBattle` (command) | Matchmaking | Battle |
| `BattleCreated` | Battle | Matchmaking |
| `BattleCompleted` | Battle | Matchmaking, Players |

`BattleCompleted` includes nullable `WinnerIdentityId`/`LoserIdentityId` for draw cases, plus `TurnCount`, `DurationMs`, `RulesetVersion`.

### Contract Project Ownership
- `Kombats.Players.Contracts` — owned by Players
- `Kombats.Matchmaking.Contracts` — owned by Matchmaking
- `Kombats.Battle.Contracts` — owned by Battle
- `Kombats.Battle.Realtime.Contracts` — SignalR event names and client-facing types

---

## Messaging Patterns

- **Integration events**: pub/sub via RabbitMQ exchanges (MassTransit publish)
- **Commands**: point-to-point via RabbitMQ queues (MassTransit send)
- **No synchronous cross-service calls** (AD-09)

Data flow direction:
```
Players --(PlayerCombatProfileChanged)--> Matchmaking
Matchmaking --(CreateBattle command)--> Battle
Battle --(BattleCreated, BattleCompleted)--> Matchmaking, Players
```

---

## Shared Messaging Library

`Kombats.Messaging` provides:
- MassTransit bus configuration (RabbitMQ transport, 8.3.0)
- Outbox/inbox configuration
- Entity name formatter (consistent exchange/queue naming: `combats.{event-name}`, kebab-case)
- Topology configuration
- Consumer registration (assembly-scanning)
- Retry: 5 attempts, 200ms–5000ms exponential
- Redelivery: 30s, 120s, 600s
- Consume logging filter
- RabbitMQ health check contribution

Changes to this library affect all three services — proportional care required.
