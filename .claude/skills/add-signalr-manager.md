# Skill: Add SignalR Manager

Create or extend a SignalR hub manager for real-time communication.

---

## When to Use

When adding a new SignalR hub connection or adding new events/actions to an existing hub (BattleHub or ChatHub).

---

## Architecture Context

Kombats uses two independent SignalR hubs:

| Hub | Endpoint | Lifecycle | DB |
|-----|----------|-----------|-----|
| BattleHub | `/battlehub` | Battle-scoped (connect on entry, disconnect on end) | Battle service |
| ChatHub | `/chathub` | Session-scoped (connect on auth, persist through battle) | Chat service |

Managers live in `transport/signalr/` and are plain TypeScript classes — no React.

---

## Steps

### 1. Create or Extend Manager

```typescript
// src/transport/signalr/{name}-hub.ts
import {
  HubConnectionBuilder,
  HubConnection,
  HubConnectionState,
  LogLevel,
} from '@microsoft/signalr';
import type { ConnectionStatus } from './connection-state';

export class {Name}HubManager {
  private connection: HubConnection | null = null;
  private onStatusChange: ((status: ConnectionStatus) => void) | null = null;

  setStatusHandler(handler: (status: ConnectionStatus) => void) {
    this.onStatusChange = handler;
  }

  async connect(url: string, accessToken: string): Promise<void> {
    if (this.connection?.state === HubConnectionState.Connected) return;

    this.connection = new HubConnectionBuilder()
      .withUrl(url, {
        accessTokenFactory: () => accessToken,
      })
      .withAutomaticReconnect([0, 1000, 2000, 4000, 8000, 16000, 30000])
      .configureLogging(LogLevel.Warning)
      .build();

    this.connection.onreconnecting(() => {
      this.onStatusChange?.('reconnecting');
    });

    this.connection.onreconnected(() => {
      this.onStatusChange?.('connected');
    });

    this.connection.onclose(() => {
      this.onStatusChange?.('disconnected');
    });

    this.onStatusChange?.('connecting');
    await this.connection.start();
    this.onStatusChange?.('connected');
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.stop();
      this.connection = null;
      this.onStatusChange?.('disconnected');
    }
  }

  // --- Event Subscriptions (return unsubscribe function) ---

  onSomeEvent(handler: (data: SomeEventType) => void): () => void {
    this.connection?.on('SomeEvent', handler);
    return () => {
      this.connection?.off('SomeEvent', handler);
    };
  }

  // --- Outbound Actions ---

  async sendSomeAction(payload: ActionPayload): Promise<void> {
    await this.connection?.invoke('SomeMethod', payload);
  }
}
```

### 2. Define Connection State Types

```typescript
// src/transport/signalr/connection-state.ts
export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting';
```

### 3. Create Connection Hook in Module

```typescript
// src/modules/{module}/hooks.ts
import { useEffect, useRef } from 'react';
import { {Name}HubManager } from '@/transport/signalr/{name}-hub';
import { useAuthStore } from '@/modules/auth/store';
import { use{Module}Store } from './store';

export function use{Name}Connection(/* scope params like battleId */) {
  const managerRef = useRef<{Name}HubManager | null>(null);
  const store = use{Module}Store();

  useEffect(() => {
    const manager = new {Name}HubManager();
    managerRef.current = manager;

    const accessToken = useAuthStore.getState().accessToken;
    if (!accessToken) return;

    // Wire status changes to store
    manager.setStatusHandler((status) => {
      store.setConnectionStatus(status);
    });

    // Connect
    manager.connect(hubUrl, accessToken).then(() => {
      // Wire inbound events to store actions
      const unsubs = [
        manager.onSomeEvent((data) => store.handleSomeEvent(data)),
        manager.onAnotherEvent((data) => store.handleAnotherEvent(data)),
      ];

      // Cleanup on unmount
      return () => {
        unsubs.forEach(unsub => unsub());
      };
    });

    return () => {
      manager.disconnect();
      managerRef.current = null;
    };
  }, [/* scope dependencies */]);

  return managerRef;
}
```

### 4. Battle-Specific: Action Submission

The BattleHub `SubmitAction` method requires a JSON **string**, not an object:

```typescript
// CORRECT
async submitAction(payload: BattleActionPayload): Promise<void> {
  const serialized = JSON.stringify(payload);
  await this.connection?.invoke('SubmitAction', serialized);
}

// WRONG — will cause server-side deserialization failure
async submitAction(payload: BattleActionPayload): Promise<void> {
  await this.connection?.invoke('SubmitAction', payload); // object, not string!
}
```

This is a critical contract requirement. Unit test it:

```typescript
it('submitAction sends JSON string', async () => {
  const payload = { attackZone: 'Head', blockZone: 'Chest' };
  await manager.submitAction(payload);
  expect(invokeSpy).toHaveBeenCalledWith('SubmitAction', JSON.stringify(payload));
});
```

### 5. Token Refresh on Reconnect

When SignalR reconnects, the token may have expired. The `accessTokenFactory` is called on each reconnect:

```typescript
.withUrl(url, {
  accessTokenFactory: () => {
    // Get fresh token from auth store at reconnect time
    return useAuthStore.getState().accessToken ?? '';
  },
})
```

---

## Checklist

- [ ] Manager in `transport/signalr/{name}-hub.ts`
- [ ] Manager is plain TypeScript class — no React imports
- [ ] Event subscriptions return unsubscribe functions
- [ ] Connection hook in `modules/{module}/hooks.ts` wires events to store
- [ ] Cleanup on unmount: unsubscribe events + disconnect
- [ ] Connection status exposed to store
- [ ] Automatic reconnect with backoff configured
- [ ] `accessTokenFactory` reads fresh token from auth store
- [ ] Battle: `SubmitAction` sends JSON string (tested)
- [ ] BattleHub: battle-scoped lifecycle (connect/disconnect per battle)
- [ ] ChatHub: session-scoped lifecycle (persist across navigation)
- [ ] No React, Zustand, or TanStack imports in manager class
