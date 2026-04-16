import {
  HubConnectionBuilder,
  HubConnection,
  HubConnectionState,
  LogLevel,
} from '@microsoft/signalr';
import { config } from '@/config';
import type { ConnectionState } from './connection-state';
import type {
  BattleSnapshotRealtime,
  BattleReadyRealtime,
  TurnOpenedRealtime,
  PlayerDamagedRealtime,
  TurnResolvedRealtime,
  BattleStateUpdatedRealtime,
  BattleEndedRealtime,
  BattleFeedUpdate,
} from '@/types/battle';

const RECONNECT_DELAYS = [0, 1000, 2000, 5000, 10000, 30000];

export type BattleHubEvents = {
  onBattleReady?: (data: BattleReadyRealtime) => void;
  onTurnOpened?: (data: TurnOpenedRealtime) => void;
  onPlayerDamaged?: (data: PlayerDamagedRealtime) => void;
  onTurnResolved?: (data: TurnResolvedRealtime) => void;
  onBattleStateUpdated?: (data: BattleStateUpdatedRealtime) => void;
  onBattleEnded?: (data: BattleEndedRealtime) => void;
  onBattleFeedUpdated?: (data: BattleFeedUpdate) => void;
  onBattleConnectionLost?: () => void;
  onConnectionStateChanged?: (state: ConnectionState) => void;
};

export class BattleHubManager {
  private connection: HubConnection | null = null;
  private events: BattleHubEvents = {};
  private _connectionState: ConnectionState = 'disconnected';
  private accessTokenFactory: () => string;

  constructor(accessTokenFactory: () => string) {
    this.accessTokenFactory = accessTokenFactory;
  }

  get connectionState(): ConnectionState {
    return this._connectionState;
  }

  setEventHandlers(handlers: BattleHubEvents): void {
    this.events = handlers;
  }

  async connect(): Promise<void> {
    if (this.connection?.state === HubConnectionState.Connected) return;

    this.setConnectionState('connecting');

    this.connection = new HubConnectionBuilder()
      .withUrl(`${config.bff.baseUrl}/battlehub`, {
        accessTokenFactory: this.accessTokenFactory,
      })
      .withAutomaticReconnect(RECONNECT_DELAYS)
      .configureLogging(LogLevel.Warning)
      .build();

    this.registerEvents(this.connection);
    this.registerLifecycle(this.connection);

    await this.connection.start();
    this.setConnectionState('connected');
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.stop();
      this.connection = null;
    }
    this.setConnectionState('disconnected');
  }

  async joinBattle(battleId: string): Promise<BattleSnapshotRealtime> {
    this.assertConnected();
    return await this.connection!.invoke<BattleSnapshotRealtime>('JoinBattle', battleId);
  }

  async submitTurnAction(battleId: string, turnIndex: number, payload: string): Promise<void> {
    this.assertConnected();
    await this.connection!.invoke('SubmitTurnAction', battleId, turnIndex, payload);
  }

  private registerEvents(conn: HubConnection): void {
    conn.on('BattleReady', (data: BattleReadyRealtime) => this.events.onBattleReady?.(data));
    conn.on('TurnOpened', (data: TurnOpenedRealtime) => this.events.onTurnOpened?.(data));
    conn.on('PlayerDamaged', (data: PlayerDamagedRealtime) =>
      this.events.onPlayerDamaged?.(data),
    );
    conn.on('TurnResolved', (data: TurnResolvedRealtime) => this.events.onTurnResolved?.(data));
    conn.on('BattleStateUpdated', (data: BattleStateUpdatedRealtime) =>
      this.events.onBattleStateUpdated?.(data),
    );
    conn.on('BattleEnded', (data: BattleEndedRealtime) => this.events.onBattleEnded?.(data));
    conn.on('BattleFeedUpdated', (data: BattleFeedUpdate) =>
      this.events.onBattleFeedUpdated?.(data),
    );
    conn.on('BattleConnectionLost', () => this.events.onBattleConnectionLost?.());
  }

  private registerLifecycle(conn: HubConnection): void {
    conn.onreconnecting(() => {
      this.setConnectionState('reconnecting');
    });

    conn.onreconnected(() => {
      this.setConnectionState('connected');
    });

    conn.onclose(() => {
      this.setConnectionState('disconnected');
    });
  }

  private setConnectionState(state: ConnectionState): void {
    this._connectionState = state;
    this.events.onConnectionStateChanged?.(state);
  }

  private assertConnected(): void {
    if (!this.connection || this.connection.state !== HubConnectionState.Connected) {
      throw new Error('BattleHubManager: not connected');
    }
  }
}
