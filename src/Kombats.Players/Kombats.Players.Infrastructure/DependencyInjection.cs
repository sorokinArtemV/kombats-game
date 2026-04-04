using Kombats.Players.Application.Abstractions;
using Kombats.Players.Infrastructure.Configuration;
using Kombats.Players.Infrastructure.Data;
using Kombats.Players.Infrastructure.Persistence.EF;
using Kombats.Players.Infrastructure.Persistence.Repository;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Kombats.Players.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddPlayersInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.AddScoped<IUnitOfWork, EfUnitOfWork>();
        services.AddScoped<ICharacterRepository, CharacterRepository>();
        services.AddScoped<IInboxRepository, InboxRepository>();
        services.AddScoped<ILevelingConfigProvider, LevelingConfigProvider>();

        services.AddDbContext<PlayersDbContext>(options =>
        {
            options
                .UseNpgsql(configuration.GetConnectionString("PostgresConnection"), npgsql =>
                    npgsql.MigrationsHistoryTable("__ef_migrations_history", PlayersDbContext.Schema))
                .UseSnakeCaseNamingConvention()
                .ReplaceService<IHistoryRepository, SnakeCaseHistoryRepository>();
        });

        return services;
    }
}
