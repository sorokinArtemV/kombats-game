# Feature Spec: BattleFinishedEvent Consumer Wiring in Players Service

## Goal

Players Service must consume `BattleFinishedEvent` messages from the message bus and route them into the existing application logic that updates player progression.

After processing a battle result, Players Service must:
- update XP
- update Level
- persist the changes
- publish updated `PlayerMatchProfileChangedIntegrationEvent` messages for affected players

This is an integration wiring task, not a business logic redesign task.

---

## System Context

The system consists of separate microservices:

### Players Service
Owns:
- Character
- XP / Level
- Stats
- OnboardingState

Players is the source of truth for player progression state.

### Matchmaking Service
Owns:
- queueing
- matching
- local player projection

Matchmaking must not synchronously call Players on its hot path.

### Battle Engine
Owns:
- battle execution
- battle results

After a battle finishes, Battle Engine publishes `BattleFinishedEvent`.

---

## Target End-to-End Flow

1. Battle Engine publishes `BattleFinishedEvent`
2. RabbitMQ / MassTransit delivers the event to Players Service
3. Players Service consumer receives the message
4. Consumer forwards the message into existing application logic
5. Application logic updates XP / Level / Revision
6. Players Service publishes `PlayerMatchProfileChangedIntegrationEvent` for affected players
7. Matchmaking consumes those events and updates its projection

---

## Existing Assumptions

The following are assumed to already exist in Players Service:

- `BattleFinishedEvent` contract
- `HandleBattleFinishedCommand`
- `HandleBattleFinishedHandler`
- logic for XP / Level updates
- publishing of `PlayerMatchProfileChangedIntegrationEvent` after successful persistence

This feature must reuse the existing application logic and must not duplicate it.

---

## Functional Requirement

Players Service must be able to consume `BattleFinishedEvent` from the message bus.

When such an event is received:
- the existing battle-finished application flow must run
- progression changes must be persisted
- outbound matchmaking-profile events must be published by the existing logic

---

## Inbound Contract

Players Service must consume the existing `BattleFinishedEvent`.

Expected fields are assumed to include:
- `WinnerIdentityId`
- `LoserIdentityId`
- `WinnerXp`
- `LoserXp`
- `OccurredAt`

Important:
- do not redesign this contract in this task
- do not add fields
- do not change the publisher-side contract

---

## Core Architectural Rule

The consumer must be a **thin integration adapter**.

The consumer must:
- receive the message
- map it to the existing application input
- invoke application logic

The consumer must not:
- contain progression business logic
- update the database directly
- duplicate XP / Level logic
- know anything about Matchmaking internals

---

## Layer Responsibilities

### Consumer
- inbound integration boundary only
- no business logic

### Application Layer
- orchestration of battle-finished processing
- uses existing command/handler flow

### Domain Layer
- progression rules
- entity state transitions

### Infrastructure
- MassTransit consumer registration
- message bus wiring

---

## Idempotency / Duplicate Delivery

The design must account for the possibility that `BattleFinishedEvent` may be delivered more than once.

If there is already an inbox / idempotency pattern in the codebase:
- reuse it
- integrate with existing conventions

If the codebase does not yet provide a clean inbound idempotency path for this flow:
- do not invent a large new reliability subsystem in this task
- instead, explicitly document the gap

Claude must analyze what already exists and recommend the minimal correct approach for this codebase.

---

## Required Implementation Scope

This feature should include:

1. A MassTransit consumer for `BattleFinishedEvent`
2. Registration of that consumer in Players Service
3. Wiring from the consumer into the existing application logic
4. Preserving existing outbound event publishing behavior

---

## Explicitly Out of Scope

Do not do any of the following in this task:

- redesign progression rules
- rewrite `HandleBattleFinishedHandler`
- move business logic into the consumer
- introduce Redis
- introduce Matchmaking logic into Players
- redesign outbound `PlayerMatchProfileChangedIntegrationEvent`
- introduce an outbox
- modify Battle Engine
- modify Matchmaking
- perform broad refactoring unrelated to this integration slice

---

## Error Handling Expectations

If application logic fails:
- let normal MassTransit retry/error behavior apply
- do not introduce custom retry orchestration in this task unless clearly required by existing project conventions

---

## Design Constraints

- follow existing CQRS patterns and project conventions
- keep changes minimal but production-viable
- preserve service boundaries
- fix only clearly related and localized issues if needed
- do not broaden scope

---

## Definition of Done

This feature is complete when:

1. Players Service has a real inbound consumer for `BattleFinishedEvent`
2. The consumer is registered and reachable through MassTransit
3. Receiving a battle-finished message triggers the existing application logic
4. XP / Level changes are persisted through the existing flow
5. Existing outbound `PlayerMatchProfileChangedIntegrationEvent` publishing still happens
6. No business logic is duplicated in the consumer
7. No Matchmaking concerns leak into Players

---

## What Claude Must Analyze Before Implementation

Claude must analyze:

1. What already exists in the codebase for this flow
2. Whether `HandleBattleFinishedHandler` is reusable as-is
3. How the consumer should invoke application logic
4. Where the consumer should live
5. How the consumer should be registered
6. Whether existing inbox/idempotency support already covers this path
7. What files should be created or modified
8. What risks exist in the current codebase
9. What must be fixed now vs what can remain acceptable for MVP

---

## Expected Output From Claude During Analysis

Claude should provide:

- current state
- gaps
- recommended inbound wiring design
- idempotency assessment
- file-by-file implementation plan
- risks / trade-offs
- scope boundaries

---

## Spec Governance

This document is a living spec.

Rules:
- Claude may propose spec refinements
- Claude must not silently redefine the spec
- any spec changes must be explicit and reviewable
- implementation must follow the approved version of the spec