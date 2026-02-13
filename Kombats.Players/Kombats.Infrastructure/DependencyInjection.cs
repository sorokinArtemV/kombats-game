using BuildingBlocks.Messaging;
using Kombats.Infrastructure.Messaging.Consumers;
using MassTransit;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Kombats.Infrastructure;


public static class DependencyInjection
{
    public static IServiceCollection AddPlayersInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {

        services.AddMessageBus(
            configuration,
            configureConsumers: bus =>
            {
                bus.AddConsumer<IdentityRegisteredConsumer>();
            },
            configure: (context, cfg) =>
            {
                cfg.ReceiveEndpoint("players-auth-identity-registered", e =>
                {
                    e.ConfigureConsumer<IdentityRegisteredConsumer>(context);
                });
            });

        return services;
    }
}
