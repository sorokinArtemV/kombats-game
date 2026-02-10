using Kombats.Auth.Application.UseCases.Login;
using Kombats.Auth.Application.UseCases.Logout;
using Kombats.Auth.Application.UseCases.Refresh;
using Kombats.Auth.Application.UseCases.Register;
using Kombats.BuildingBlocks.DependencyInjection;
using Microsoft.Extensions.DependencyInjection;

namespace Kombats.Auth.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddScoped<RegisterUseCase>();
        services.AddScoped<LoginUseCase>();
        services.AddScoped<RefreshUseCase>();
        services.AddScoped<LogoutUseCase>();
        services.AddApplicationServices<AssemblyMarker>();

        return services;
    }
}