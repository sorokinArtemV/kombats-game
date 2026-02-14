using Kombats.Shared.Behaviours;
using Kombats.Shared.Types;
using Microsoft.Extensions.DependencyInjection;

namespace Kombats.Players.Application;

public static class ApplicationServicesExtensions
{
    public static IServiceCollection AddApplicationServices<TAssemblyMarker>(
        this IServiceCollection services)
    {
        services.Scan(scan => scan
            .FromAssembliesOf(typeof(TAssemblyMarker))
            .AddClasses(c => c.AssignableTo(typeof(ICommandHandler<>)), publicOnly: false)
            .AsImplementedInterfaces()
            .WithScopedLifetime()
            .AddClasses(c => c.AssignableTo(typeof(ICommandHandler<,>)), publicOnly: false)
            .AsImplementedInterfaces()
            .WithScopedLifetime());

        services.Decorate(typeof(ICommandHandler<,>), typeof(LoggingDecorator.CommandHandler<,>));
        
        if (services.Any(d =>
                d.ServiceType.IsGenericType &&
                d.ServiceType.GetGenericTypeDefinition() == typeof(ICommandHandler<>)))
        {
            services.Decorate(typeof(ICommandHandler<>), typeof(LoggingDecorator.CommandBaseHandler<>));
        }

        return services;
    }
}
