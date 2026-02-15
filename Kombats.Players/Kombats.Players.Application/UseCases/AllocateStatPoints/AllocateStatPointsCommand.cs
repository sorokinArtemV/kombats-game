using Kombats.Shared.Types;

namespace Kombats.Players.Application.UseCases.AllocateStatPoints;

public sealed record AllocateStatPointsCommand(
    Guid PlayerId,
    int Str,
    int Agi,
    int Intuition,
    int Vit) : ICommand<AllocateStatPointsResult>;

