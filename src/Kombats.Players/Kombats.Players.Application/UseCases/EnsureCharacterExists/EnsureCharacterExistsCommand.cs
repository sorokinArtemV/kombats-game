using Kombats.Abstractions;

namespace Kombats.Players.Application.UseCases.EnsureCharacterExists;

public sealed record EnsureCharacterExistsCommand(Guid IdentityId) : ICommand<CharacterStateResult>;
