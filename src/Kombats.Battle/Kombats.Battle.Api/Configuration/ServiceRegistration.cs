using Kombats.Battle.Application.Ports;
using Kombats.Battle.Application.UseCases.Lifecycle;
using Kombats.Battle.Application.UseCases.Turns;
using Kombats.Battle.Domain.Engine;

namespace Kombats.Battle.Api.Configuration;

/// <summary>
/// Registers domain and application services.
/// </summary>
internal static class ServiceRegistration
{
    public static IServiceCollection AddBattleDomainServices(this IServiceCollection services)
    {
        services.AddScoped<IBattleEngine, BattleEngine>();
        return services;
    }

    public static IServiceCollection AddBattleApplicationServices(this IServiceCollection services)
    {
        services.AddScoped<IActionIntake, ActionIntakeService>();
        services.AddScoped<BattleLifecycleAppService>();
        services.AddScoped<BattleTurnAppService>();
        return services;
    }
}
