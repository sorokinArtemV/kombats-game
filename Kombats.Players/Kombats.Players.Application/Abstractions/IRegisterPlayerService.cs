using Kombats.Shared.Events;

namespace Kombats.Players.Application.Abstractions;

public interface IRegisterPlayerService
{
   public Task RegisterAsync(IdentityRegisteredEvent e, CancellationToken ct);
}