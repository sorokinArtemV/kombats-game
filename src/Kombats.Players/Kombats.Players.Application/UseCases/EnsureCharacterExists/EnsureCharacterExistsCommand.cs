using Kombats.Players.Application;
using Kombats.Shared.Types;

namespace Kombats.Players.Application.UseCases.EnsureCharacterExists;

public sealed record EnsureCharacterExistsCommand(Guid IdentityId) : ICommand<CharacterStateResult>;
