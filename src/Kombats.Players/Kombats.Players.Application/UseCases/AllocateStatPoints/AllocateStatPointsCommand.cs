using Kombats.Shared.Types;

namespace Kombats.Players.Application.UseCases.AllocateStatPoints;

public sealed record AllocateStatPointsCommand(
    Guid IdentityId,
    int ExpectedRevision,
    int Str,
    int Agi,
    int Intuition,
    int Vit) : ICommand<AllocateStatPointsResult>;



