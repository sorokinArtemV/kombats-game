using FluentValidation;
using Kombats.BuildingBlocks.Behaviours;
using Microsoft.Extensions.DependencyInjection;
using Shared;

namespace Kombats.BuildingBlocks.DependencyInjection;

public static class ApplicationServicesExtensions
{
    public static IServiceCollection AddApplicationServices<TAssemblyMarker>(
        this IServiceCollection services)
    {
        services.Scan(scan => scan
            .FromAssembliesOf(typeof(TAssemblyMarker))
            .AddClasses(classes => classes.AssignableTo(typeof(ICommandHandler<>)), publicOnly: false)
            .AsImplementedInterfaces()
            .WithScopedLifetime()
            .AddClasses(classes => classes.AssignableTo(typeof(ICommandHandler<,>)), publicOnly: false)
            .AsImplementedInterfaces()
            .WithScopedLifetime());
        
        services.Decorate(typeof(ICommandHandler<,>), typeof(LoggingDecorator.CommandHandler<,>));
        services.Decorate(typeof(ICommandHandler<>), typeof(LoggingDecorator.CommandBaseHandler<>));

        services.AddValidatorsFromAssembly(typeof(TAssemblyMarker).Assembly, includeInternalTypes: true);

        return services;
    }
}