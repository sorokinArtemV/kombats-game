import {
  HubConnectionBuilder,
  HubConnection,
  HubConnectionState,
  LogLevel,
} from '@microsoft/signalr';
import { config } from '@/config';
import type { ConnectionState } from './connection-state';
import type {
  JoinGlobalChatResponse,
  SendDirectMessageResponse,
  GlobalMessageEvent,
  DirectMessageEvent,
  PlayerOnlineEvent,
  PlayerOfflineEvent,
  ChatErrorEvent,
} from '@/types/chat';

const RECONNECT_DELAYS = [0, 1000, 2000, 5000, 10000, 30000];

export type ChatHubEvents = {
  onGlobalMessageReceived?: (data: GlobalMessageEvent) => void;
  onDirectMessageReceived?: (data: DirectMessageEvent) => void;
  onPlayerOnline?: (data: PlayerOnlineEvent) => void;
  onPlayerOffline?: (data: PlayerOfflineEvent) => void;
  onChatError?: (data: ChatErrorEvent) => void;
  onChatConnectionLost?: () => void;
  onConnectionStateChanged?: (state: ConnectionState) => void;
};

export class ChatHubManager {
  private connection: HubConnection | null = null;
  private events: ChatHubEvents = {};
  private _connectionState: ConnectionState = 'disconnected';
  private accessTokenFactory: () => string;

  constructor(accessTokenFactory: () => string) {
    this.accessTokenFactory = accessTokenFactory;
  }

  get connectionState(): ConnectionState {
    return this._connectionState;
  }

  setEventHandlers(handlers: ChatHubEvents): void {
    this.events = handlers;
  }

  async connect(): Promise<void> {
    if (this.connection?.state === HubConnectionState.Connected) return;

    this.setConnectionState('connecting');

    this.connection = new HubConnectionBuilder()
      .withUrl(`${config.bff.baseUrl}/chathub`, {
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

  async joinGlobalChat(): Promise<JoinGlobalChatResponse> {
    this.assertConnected();
    return await this.connection!.invoke<JoinGlobalChatResponse>('JoinGlobalChat');
  }

  async leaveGlobalChat(): Promise<void> {
    this.assertConnected();
    await this.connection!.invoke('LeaveGlobalChat');
  }

  async sendGlobalMessage(content: string): Promise<void> {
    this.assertConnected();
    await this.connection!.invoke('SendGlobalMessage', content);
  }

  async sendDirectMessage(
    recipientPlayerId: string,
    content: string,
  ): Promise<SendDirectMessageResponse> {
    this.assertConnected();
    return await this.connection!.invoke<SendDirectMessageResponse>(
      'SendDirectMessage',
      recipientPlayerId,
      content,
    );
  }

  private registerEvents(conn: HubConnection): void {
    conn.on('GlobalMessageReceived', (data: GlobalMessageEvent) =>
      this.events.onGlobalMessageReceived?.(data),
    );
    conn.on('DirectMessageReceived', (data: DirectMessageEvent) =>
      this.events.onDirectMessageReceived?.(data),
    );
    conn.on('PlayerOnline', (data: PlayerOnlineEvent) => this.events.onPlayerOnline?.(data));
    conn.on('PlayerOffline', (data: PlayerOfflineEvent) => this.events.onPlayerOffline?.(data));
    conn.on('ChatError', (data: ChatErrorEvent) => this.events.onChatError?.(data));
    conn.on('ChatConnectionLost', () => this.events.onChatConnectionLost?.());
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
      throw new Error('ChatHubManager: not connected');
    }
  }
}
