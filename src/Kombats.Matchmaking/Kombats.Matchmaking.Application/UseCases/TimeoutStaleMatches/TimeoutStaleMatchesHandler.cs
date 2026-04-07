using Kombats.Abstractions;
using Kombats.Matchmaking.Application.Abstractions;
using Microsoft.Extensions.Logging;

namespace Kombats.Matchmaking.Application.UseCases.TimeoutStaleMatches;

public sealed class TimeoutStaleMatchesHandler : ICommandHandler<TimeoutStaleMatchesCommand, int>
{
    private readonly IMatchRepository _matchRepository;
    private readonly ILogger<TimeoutStaleMatchesHandler> _logger;

    public TimeoutStaleMatchesHandler(
        IMatchRepository matchRepository,
        ILogger<TimeoutStaleMatchesHandler> logger)
    {
        _matchRepository = matchRepository;
        _logger = logger;
    }

    public async Task<Result<int>> HandleAsync(TimeoutStaleMatchesCommand cmd, CancellationToken ct)
    {
        var now = DateTimeOffset.UtcNow;
        var cutoff = now.AddSeconds(-cmd.TimeoutSeconds);

        var affected = await _matchRepository.TimeoutStaleMatchesAsync(cutoff, now, ct);

        if (affected > 0)
        {
            _logger.LogWarning(
                "Timed out {Count} stale matches older than {TimeoutSeconds}s",
                affected, cmd.TimeoutSeconds);
        }

        return affected;
    }
}
