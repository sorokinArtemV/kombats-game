namespace Kombats.Players.Application.UseCases.RegisterPlayer;

public sealed record RegisterPlayerResult(Guid PlayerId, bool Created);
