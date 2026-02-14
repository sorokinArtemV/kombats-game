using Kombats.Players.Application.Abstractions;
using Kombats.Shared.Events;

namespace Kombats.Players.Application;

public class RegisterPlayerService : IRegisterPlayerService
{
    
    public async Task RegisterAsync(IdentityRegisteredEvent e, CancellationToken ct)
    {
        Console.WriteLine($"Registering player with id:{e.IdentityId} and email: {e.Email}");
         await Task.CompletedTask;
    }
}