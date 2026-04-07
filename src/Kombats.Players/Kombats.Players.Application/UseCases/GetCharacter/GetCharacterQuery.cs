using Kombats.Abstractions;

namespace Kombats.Players.Application.UseCases.GetCharacter;

public sealed record GetCharacterQuery(Guid IdentityId) : IQuery<CharacterStateResult>;
