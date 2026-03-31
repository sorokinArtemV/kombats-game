using Microsoft.Extensions.DependencyInjection;

namespace Kombats.Players.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddPlayersApplication(this IServiceCollection services)
    {
        services.AddApplicationServices<AssemblyMarker>();
        
        return services;
    }
}