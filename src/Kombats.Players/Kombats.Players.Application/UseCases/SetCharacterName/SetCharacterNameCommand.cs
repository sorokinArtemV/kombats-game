using Kombats.Players.Application;
using Kombats.Shared.Types;

namespace Kombats.Players.Application.UseCases.SetCharacterName;

public sealed record SetCharacterNameCommand(Guid IdentityId, string Name) : ICommand<CharacterStateResult>;
