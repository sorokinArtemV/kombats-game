using System.Text.Json.Serialization;
using Combats.Infrastructure.Messaging.DependencyInjection;
using Kombats.Battle.Api.Workers;
using Kombats.Battle.Application.Ports;
using Kombats.Battle.Contracts.Battle;
using Kombats.Battle.Infrastructure.Data;
using Kombats.Battle.Infrastructure.Data.DbContext;
using Kombats.Battle.Infrastructure.Messaging.Consumers;
using Kombats.Battle.Infrastructure.Messaging.Projections;
using Kombats.Battle.Infrastructure.Messaging.Publisher;
using Kombats.Battle.Infrastructure.Realtime.SignalR;
using Kombats.Battle.Infrastructure.Rules;
using Kombats.Battle.Infrastructure.State.Redis;
using Kombats.Battle.Infrastructure.Time;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Migrations;
using StackExchange.Redis;

namespace Kombats.Battle.Api.Configuration;

/// <summary>
/// Registers infrastructure services: databases, Redis, messaging, SignalR, workers.
/// </summary>
internal static class InfrastructureRegistration
{
    public static IServiceCollection AddBattleInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration,
        IWebHostEnvironment environment)
    {
        services.AddBattlePostgres(configuration);
        services.AddBattleRedis(configuration);
        services.AddBattleOptions(configuration);
        services.AddBattlePorts();
        services.AddBattleSignalR(environment);
        services.AddBattleMessaging(configuration);
        services.AddBattleWorkers();

        return services;
    }

    private static void AddBattlePostgres(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<BattleDbContext>(options =>
        {
            var connectionString = configuration.GetConnectionString("DefaultConnection")
                                   ?? throw new InvalidOperationException("DefaultConnection connection string is required");
            options.UseNpgsql(connectionString, npgsql =>
                    npgsql.MigrationsHistoryTable("__ef_migrations_history", BattleDbContext.Schema))
                .UseSnakeCaseNamingConvention()
                .ReplaceService<IHistoryRepository, SnakeCaseHistoryRepository>();
        });
    }

    private static void AddBattleRedis(this IServiceCollection services, IConfiguration configuration)
    {
        var redisConnectionString = configuration.GetConnectionString("Redis") ?? "localhost:6379";
        services.AddSingleton<IConnectionMultiplexer>(_ => ConnectionMultiplexer.Connect(redisConnectionString));
    }

    private static void AddBattleOptions(this IServiceCollection services, IConfiguration configuration)
    {
        services.Configure<BattleRedisOptions>(configuration.GetSection(BattleRedisOptions.SectionName));
        services.Configure<BattleRulesetsOptions>(configuration.GetSection(BattleRulesetsOptions.SectionName));
        services.Configure<TurnDeadlineWorkerOptions>(configuration.GetSection("Battle:TurnDeadlineWorker"));

        services.AddOptions<BattleRulesetsOptions>()
            .Bind(configuration.GetSection(BattleRulesetsOptions.SectionName))
            .Validate(RulesetsOptionsValidator.Validate)
            .ValidateOnStart();
    }

    private static void AddBattlePorts(this IServiceCollection services)
    {
        services.AddScoped<IBattleStateStore, RedisBattleStateStore>();
        services.AddScoped<IBattleRealtimeNotifier, SignalRBattleRealtimeNotifier>();
        services.AddScoped<IBattleEventPublisher, MassTransitBattleEventPublisher>();
        services.AddSingleton<IClock, SystemClock>();
        services.AddScoped<IRulesetProvider, RulesetProvider>();
        services.AddSingleton<ISeedGenerator, SeedGenerator>();
    }

    private static void AddBattleSignalR(this IServiceCollection services, IWebHostEnvironment environment)
    {
        services.AddSignalR(options => { options.EnableDetailedErrors = environment.IsDevelopment(); })
            .AddJsonProtocol(options => { options.PayloadSerializerOptions.Converters.Add(new JsonStringEnumConverter()); });
    }

    private static void AddBattleMessaging(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddMessaging<BattleDbContext>(
            configuration,
            "battle",
            x =>
            {
                x.AddConsumer<CreateBattleConsumer>();
                x.AddConsumer<BattleCompletedProjectionConsumer>();
            },
            messagingBuilder =>
            {
                messagingBuilder.Map<CreateBattle>("CreateBattle");
                messagingBuilder.Map<BattleCompleted>("BattleCompleted");
            });
    }

    private static void AddBattleWorkers(this IServiceCollection services)
    {
        services.AddHostedService<TurnDeadlineWorker>();
    }
}
