using Kombats.Abstractions;
using Kombats.Chat.Application.Ports;

namespace Kombats.Chat.Application.UseCases.HandlePlayerProfileChanged;

/// <summary>
/// Updates the player info cache from the <c>PlayerCombatProfileChanged</c> integration event.
/// Maps the event's <c>IsReady</c> bool to the canonical <c>OnboardingState</c> string
/// ("Ready"/"NotReady") used by the eligibility model in Batch 2.
/// If <c>Name</c> is null or blank, the cache entry is removed so the display-name resolver
/// falls back to the HTTP source on next read instead of serving stale data.
/// </summary>
internal sealed class HandlePlayerProfileChangedHandler(IPlayerInfoCache cache)
    : ICommandHandler<HandlePlayerProfileChangedCommand>
{
    public async Task<Result> HandleAsync(
        HandlePlayerProfileChangedCommand command,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(command.Name))
        {
            await cache.RemoveAsync(command.IdentityId, cancellationToken);
            return Result.Success();
        }

        string onboardingState = command.IsReady ? "Ready" : "NotReady";
        var info = new CachedPlayerInfo(command.Name, onboardingState);

        await cache.SetAsync(command.IdentityId, info, cancellationToken);

        return Result.Success();
    }
}
