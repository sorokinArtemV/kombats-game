using Kombats.Players.Application.Abstractions;
using Microsoft.Extensions.DependencyInjection;

namespace Kombats.Players.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddPlayersApplication(this IServiceCollection services)
    {
        services.AddScoped<IRegisterPlayerService, RegisterPlayerService>();

        return services;
    }
}