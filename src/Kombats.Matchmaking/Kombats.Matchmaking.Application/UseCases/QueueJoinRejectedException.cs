namespace Kombats.Matchmaking.Application.UseCases;

/// <summary>
/// Thrown when a player is not eligible to join the matchmaking queue.
/// </summary>
public class QueueJoinRejectedException : Exception
{
    public QueueJoinRejectedException(string message) : base(message) { }
}
