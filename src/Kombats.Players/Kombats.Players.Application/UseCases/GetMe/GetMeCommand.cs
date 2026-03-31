using Kombats.Players.Application;
using Kombats.Shared.Types;

namespace Kombats.Players.Application.UseCases.GetMe;

public sealed record GetMeCommand(Guid IdentityId) : ICommand<CharacterStateResult>;
