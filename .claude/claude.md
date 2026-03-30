# Project: Kombats (Players / Matchmaking / Battle Engine)

## Architecture Overview

- Microservices architecture (NOT modular monolith)

Services:
- Players → source of truth for player/character
- Matchmaking → queue + matching + projection
- Battle Engine → battle execution

Communication:
- ONLY via integration events (RabbitMQ / MassTransit)
- NO direct DB access between services
- NO shared storage between services

---

## Core Architectural Rules

### Service Boundaries

#### Players Service
Owns:
- Character
- Stats
- Level / XP
- Onboarding state

MUST:
- publish integration events

MUST NOT:
- know Matchmaking storage
- write to Redis
- implement matchmaking logic

---

#### Matchmaking Service
Owns:
- Queue
- Matching logic (level bracket)
- Player projection (DB or Redis)

MUST NOT:
- depend on synchronous reads from Players in hot path

---

#### Battle Engine
Owns:
- Battle aggregate
- Battle snapshot

MUST:
- fetch players once (or receive snapshot)
- never read Players during battle

---

## CQRS Rules (SharedKernel)

Use existing interfaces:
- ICommand / ICommand<T>
- IQuery<T>
- ICommandHandler
- IQueryHandler

---

### Application Layer
- ALL classes MUST be `internal sealed`
- Commands, Queries, Handlers — internal
- Query responses — public

---

### Domain Layer
- Entities are public
- No infrastructure logic
- No external dependencies

---

## Naming Conventions (STRICT)

| Type | Pattern |
|------|--------|
| Entity | `{Name}` or `{Name}Entity` |
| Command | `{Action}Command` |
| Command Handler | `{Action}CommandHandler` |
| Query | `{Action}Query` |
| Query Handler | `{Action}QueryHandler` |
| Event | `{Name}IntegrationEvent` |

---

## Event Architecture (CRITICAL)

### Integration Events

- Used for ALL cross-service communication
- Implement `IIntegrationEvent`
- Published AFTER persistence

---

### Rule: Snapshot-style events

DO:
- PlayerMatchProfileChangedIntegrationEvent

DO NOT:
- Multiple granular events like LevelChanged, StatsChanged separately

---

## Matchmaking Profile Contract (MVP)

Players MUST publish:

PlayerMatchProfileChangedIntegrationEvent:
- IdentityId
- CharacterId
- Level
- IsReady
- Revision
- OccurredAt

---

### IsReady definition

MVP:
- OnboardingState == Ready

---

## When to Publish Events

Players MUST publish AFTER:

- Character creation
- Name set (if affects state)
- Stat allocation
- XP / Level change (battle result)

---

## Persistence Rules

- Use EF Core
- Follow existing repository patterns
- DO NOT introduce new persistence abstractions

---

## Event Publishing Rules

CRITICAL:
- Publish ONLY after successful SaveChanges
- Event must reflect committed state

---

### Reliability

Preferred:
- Outbox pattern

Allowed MVP:
- Direct publish after SaveChanges
- BUT must document risk

---

## What NOT to do

- Do NOT add Redis into Players
- Do NOT add matchmaking logic into Players
- Do NOT allow direct DB access between services
- Do NOT overengineer
- Do NOT add speculative fields (power score, etc.)

---

## Matchmaking Expectations

Matchmaking MUST:

- consume PlayerMatchProfileChangedIntegrationEvent
- maintain local projection

Projection fields:
- IdentityId
- CharacterId
- Level
- IsReady
- Revision
- UpdatedAt

Storage:
- DB first (MVP)
- Redis optional later

---

## Battle Engine Rules

- Fetch players ONCE before battle start
- Create immutable battle snapshot
- NEVER read Players during battle

---

## Coding Standards

- File-scoped namespaces (REQUIRED)
- `internal sealed` by default
- Explicit types for primitives
- Use `is null` instead of `== null`
- Use `required` for DTOs

---

## Development Workflow (Claude)

ALWAYS follow:

1. Analyze (NO code)
2. Plan (architecture + files)
3. Implement (small steps)
4. Review (critical)

---

## Current Task

Implement outbound integration events for matchmaking profile changes in Players Service.

Goal:
- Make Players publisher of matchmaking-relevant state
- Prepare Matchmaking for local projection