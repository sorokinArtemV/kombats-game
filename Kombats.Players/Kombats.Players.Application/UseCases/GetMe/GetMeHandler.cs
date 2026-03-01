using Kombats.Players.Application;
using Kombats.Players.Application.Abstractions;
using Kombats.Shared.Types;

namespace Kombats.Players.Application.UseCases.GetMe;

public sealed class GetMeHandler : ICommandHandler<GetMeCommand, CharacterStateResult>
{
    private readonly ICharacterRepository _characters;

    public GetMeHandler(ICharacterRepository characters)
    {
        _characters = characters;
    }

    public async Task<Result<CharacterStateResult>> HandleAsync(GetMeCommand cmd, CancellationToken ct)
    {
        var character = await _characters.GetByIdentityIdAsync(cmd.IdentityId, ct);
        if (character is null)
        {
            return Result.Failure<CharacterStateResult>(
                Error.NotFound("Me.NotProvisioned", "Call POST /api/me/ensure after login."));
        }

        return Result.Success(CharacterStateResult.FromCharacter(character));
    }
}
