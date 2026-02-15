using Kombats.Infrastructure.Data;
using Kombats.Infrastructure.Messaging.Consumers;
using Kombats.Infrastructure.Persistence.EF;
using Kombats.Infrastructure.Persistence.Repository;
using Kombats.Players.Application.Abstractions;
using Kombats.Shared.Messaging;
using MassTransit;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Kombats.Infrastructure;


public static class DependencyInjection
{
    public static IServiceCollection AddPlayersInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {

        services.AddScoped<IUnitOfWork, EfUnitOfWork>();
        services.AddScoped<IPlayerRepository, PlayerRepository>();
        services.AddScoped<IInboxRepository, InboxRepository>();

        
        services.AddDbContext<PlayersDbContext>(options =>
        {
            options
                .UseNpgsql(configuration.GetConnectionString("PostgresConnection"))
                .UseSnakeCaseNamingConvention();
        });

        services.AddMessageBus(
            configuration,
            configureConsumers: bus =>
            {
                bus.AddConsumer<IdentityRegisteredConsumer>();
            },
            configure: (context, cfg) =>
            {
                cfg.ReceiveEndpoint("players-identity-registered", e =>
                {
                    e.ConfigureConsumer<IdentityRegisteredConsumer>(context);
                });
            },
            autoConfigureEndpoints: false);

        return services;
    }
}
