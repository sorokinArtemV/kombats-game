using Kombats.Shared.Types;

namespace Kombats.Players.Application.UseCases.RegisterPlayer;

public sealed record RegisterPlayerCommand(
    Guid IdentityId,
    Guid MessageId,
    string Email,
    DateTimeOffset OccuredAt) : ICommand<RegisterPlayerResult>;