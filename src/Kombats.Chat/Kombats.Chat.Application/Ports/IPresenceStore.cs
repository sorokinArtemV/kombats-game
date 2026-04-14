namespace Kombats.Chat.Application.Ports;

internal interface IPresenceStore
{
    /// <summary>
    /// Records a connection. Returns true if this is the first connection (broadcast PlayerOnline).
    /// </summary>
    Task<bool> ConnectAsync(Guid identityId, string displayName, CancellationToken ct);

    /// <summary>
    /// Records a disconnection. Returns true if this was the last connection (broadcast PlayerOffline).
    /// </summary>
    Task<bool> DisconnectAsync(Guid identityId, CancellationToken ct);

    /// <summary>
    /// Renews presence TTLs and heartbeat score.
    /// </summary>
    Task HeartbeatAsync(Guid identityId, CancellationToken ct);

    /// <summary>
    /// Returns online players with display names, ordered by most-recent heartbeat.
    /// </summary>
    Task<List<OnlinePlayer>> GetOnlinePlayersAsync(int limit, int offset, CancellationToken ct);

    /// <summary>
    /// Returns total number of online players.
    /// </summary>
    Task<long> GetOnlineCountAsync(CancellationToken ct);

    /// <summary>
    /// Checks if a specific player is online.
    /// </summary>
    Task<bool> IsOnlineAsync(Guid identityId, CancellationToken ct);
}

internal sealed record OnlinePlayer(Guid PlayerId, string DisplayName);
