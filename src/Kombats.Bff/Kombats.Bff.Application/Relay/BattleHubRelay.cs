using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR.Client;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Kombats.Bff.Application.Clients;

namespace Kombats.Bff.Application.Relay;

public sealed class BattleHubRelay : IBattleHubRelay, IAsyncDisposable
{
    private readonly ConcurrentDictionary<string, HubConnection> _connections = new();
    private readonly ServicesOptions _servicesOptions;
    private readonly IFrontendBattleSender _sender;
    private readonly ILogger<BattleHubRelay> _logger;

    // The 6 server-to-client event names from Battle's RealtimeEventNames
    private static readonly string[] EventNames =
    [
        "BattleReady",
        "TurnOpened",
        "TurnResolved",
        "PlayerDamaged",
        "BattleStateUpdated",
        "BattleEnded"
    ];

    public BattleHubRelay(
        IOptions<ServicesOptions> servicesOptions,
        IFrontendBattleSender sender,
        ILogger<BattleHubRelay> logger)
    {
        _servicesOptions = servicesOptions.Value;
        _sender = sender;
        _logger = logger;
    }

    public async Task<object> JoinBattleAsync(
        Guid battleId,
        string frontendConnectionId,
        string accessToken,
        CancellationToken cancellationToken = default)
    {
        // If there's already a connection for this frontend connection, dispose it first
        await DisconnectAsync(frontendConnectionId);

        string battleHubUrl = $"{_servicesOptions.Battle.BaseUrl.TrimEnd('/')}/battlehub";

        // No WithAutomaticReconnect(): after a transport-level reconnect the downstream
        // HubConnection gets a new connection ID and is no longer in the Battle group.
        // Events would be silently dropped. Instead, on any connection loss the Closed
        // handler fires, the frontend receives BattleConnectionLost, and must re-join
        // from scratch via a new JoinBattle call.
        HubConnection connection = new HubConnectionBuilder()
            .WithUrl(battleHubUrl, options =>
            {
                options.AccessTokenProvider = () => Task.FromResult<string?>(accessToken);
            })
            .Build();

        // Subscribe to all server-to-client events from Battle and relay them to the frontend.
        // Uses IFrontendBattleSender (backed by IHubContext<BattleHub>) to target the frontend
        // connection by its stable connection ID. This is safe for use outside hub method scope,
        // unlike Hub.Clients.Caller which must not be captured in long-lived callbacks.
        foreach (string eventName in EventNames)
        {
            connection.On<object>(eventName, async (payload) =>
            {
                try
                {
                    await _sender.SendAsync(frontendConnectionId, eventName, [payload]);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex,
                        "Failed to relay {EventName} to frontend connection {ConnectionId}",
                        eventName, frontendConnectionId);
                }
            });
        }

        // Handle downstream connection closure
        connection.Closed += async (exception) =>
        {
            _logger.LogInformation(
                "Downstream Battle connection closed for frontend {ConnectionId}. Exception: {Error}",
                frontendConnectionId, exception?.Message);

            // BattleConnectionLost is a BFF-originated synthetic event — it is NOT a native
            // Battle service event. It signals that the BFF→Battle downstream connection
            // was lost. The frontend should treat this as a hard failure and re-join the
            // battle from scratch via a new JoinBattle call if the battle is still active.
            try
            {
                await _sender.SendAsync(frontendConnectionId, "BattleConnectionLost",
                    [new { Reason = exception?.Message ?? "Connection closed" }]);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex,
                    "Failed to notify frontend {ConnectionId} about connection loss",
                    frontendConnectionId);
            }
        };

        // Store the connection before connecting (so cleanup can find it if connect fails)
        _connections[frontendConnectionId] = connection;

        try
        {
            await connection.StartAsync(cancellationToken);

            _logger.LogInformation(
                "Connected to Battle hub for frontend {ConnectionId}, joining battle {BattleId}",
                frontendConnectionId, battleId);

            // Call JoinBattle on the downstream Battle hub
            object snapshot = await connection.InvokeAsync<object>(
                "JoinBattle",
                battleId,
                cancellationToken);

            // Subscribe to BattleEnded to auto-cleanup the downstream connection.
            // NOTE: This handler runs AFTER the relay handler above (which forwards BattleEnded
            // to the frontend) because SignalR client dispatches On<> handlers in registration
            // order. The relay handler in the EventNames loop was registered first, so the
            // frontend receives BattleEnded before this cleanup handler disposes the connection.
            connection.On<object>("BattleEnded", async (_) =>
            {
                _logger.LogInformation(
                    "Battle ended for frontend {ConnectionId}, cleaning up downstream connection",
                    frontendConnectionId);
                await DisconnectAsync(frontendConnectionId);
            });

            return snapshot;
        }
        catch
        {
            // If connection or JoinBattle fails, clean up
            _connections.TryRemove(frontendConnectionId, out _);
            await DisposeConnectionSafely(connection);
            throw;
        }
    }

    public async Task SubmitTurnActionAsync(
        string frontendConnectionId,
        Guid battleId,
        int turnIndex,
        string actionPayload,
        CancellationToken cancellationToken = default)
    {
        if (!_connections.TryGetValue(frontendConnectionId, out HubConnection? connection))
        {
            throw new InvalidOperationException(
                $"No active battle connection for frontend connection {frontendConnectionId}. Call JoinBattle first.");
        }

        if (connection.State != HubConnectionState.Connected)
        {
            throw new InvalidOperationException(
                $"Battle connection is in {connection.State} state, not Connected.");
        }

        await connection.InvokeAsync(
            "SubmitTurnAction",
            battleId,
            turnIndex,
            actionPayload,
            cancellationToken);
    }

    public async Task DisconnectAsync(string frontendConnectionId)
    {
        if (_connections.TryRemove(frontendConnectionId, out HubConnection? connection))
        {
            _logger.LogInformation(
                "Disposing downstream Battle connection for frontend {ConnectionId}",
                frontendConnectionId);
            await DisposeConnectionSafely(connection);
        }
    }

    public async ValueTask DisposeAsync()
    {
        foreach (string connectionId in _connections.Keys.ToArray())
        {
            await DisconnectAsync(connectionId);
        }
    }

    private static async Task DisposeConnectionSafely(HubConnection connection)
    {
        try
        {
            if (connection.State != HubConnectionState.Disconnected)
            {
                await connection.StopAsync();
            }
            await connection.DisposeAsync();
        }
        catch
        {
            // Best-effort cleanup — don't throw on dispose
        }
    }
}
