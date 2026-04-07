using System.Text.Json.Serialization;
using Kombats.Abstractions.Auth;
using Kombats.Battle.Infrastructure.Configuration;
using Scalar.AspNetCore;
using Kombats.Battle.Api.Endpoints;
using Kombats.Battle.Api.Extensions;
using Kombats.Battle.Application.Ports;
using Kombats.Battle.Application.UseCases.Lifecycle;
using Kombats.Battle.Application.UseCases.Turns;
using Kombats.Battle.Bootstrap.Workers;
using Kombats.Battle.Contracts.Battle;
using Kombats.Battle.Domain.Engine;
using Kombats.Battle.Infrastructure.Data;
using Kombats.Battle.Infrastructure.Data.DbContext;
using Kombats.Battle.Infrastructure.Messaging.Consumers;
using Kombats.Battle.Infrastructure.Messaging.Projections;
using Kombats.Battle.Infrastructure.Messaging.Publisher;
using Kombats.Battle.Infrastructure.Realtime.SignalR;
using Kombats.Battle.Infrastructure.Rules;
using Kombats.Battle.Infrastructure.State.Redis;
using Kombats.Battle.Infrastructure.Time;
using Kombats.Messaging.DependencyInjection;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Migrations;
using Serilog;
using StackExchange.Redis;

var builder = WebApplication.CreateBuilder(args);

// Logging
builder.Host.UseSerilog((context, loggerConfig) =>
    loggerConfig.ReadFrom.Configuration(context.Configuration));

// Authentication & Authorization
builder.Services.AddKombatsAuth(builder.Configuration);

// API Documentation
builder.Services.AddOpenApi();

// Endpoints
var apiAssembly = typeof(IEndpoint).Assembly;
builder.Services.AddEndpoints(apiAssembly);

// CORS
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        if (builder.Environment.IsDevelopment())
        {
            policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader();
        }
        else
        {
            var origins = builder.Configuration
                .GetSection("Cors:AllowedOrigins")
                .Get<string[]>();

            if (origins is null || origins.Length == 0)
                throw new InvalidOperationException(
                    "Cors:AllowedOrigins must be configured in non-Development environments.");

            policy.WithOrigins(origins).AllowAnyMethod().AllowAnyHeader();
        }
    });
});

// Domain services
builder.Services.AddScoped<IBattleEngine, BattleEngine>();

// Application services (direct DI — no MediatR)
builder.Services.AddScoped<IActionIntake, ActionIntakeService>();
builder.Services.AddScoped<BattleLifecycleAppService>();
builder.Services.AddScoped<BattleTurnAppService>();

// Infrastructure — persistence
builder.Services.AddDbContext<BattleDbContext>(options =>
{
    var connectionString = builder.Configuration.GetConnectionString("PostgresConnection")
                           ?? throw new InvalidOperationException("PostgresConnection connection string is required.");
    options.UseNpgsql(connectionString, npgsql =>
            npgsql.MigrationsHistoryTable("__ef_migrations_history", BattleDbContext.Schema))
        .UseSnakeCaseNamingConvention()
        .ReplaceService<IHistoryRepository, SnakeCaseHistoryRepository>();
});

// Infrastructure — Redis
var redisConnectionString = builder.Configuration.GetConnectionString("Redis") ?? "localhost:6379";
builder.Services.AddSingleton<IConnectionMultiplexer>(_ => ConnectionMultiplexer.Connect(redisConnectionString));

// Infrastructure — options
builder.Services.Configure<BattleRedisOptions>(
    builder.Configuration.GetSection(BattleRedisOptions.SectionName));
builder.Services.Configure<BattleRulesetsOptions>(
    builder.Configuration.GetSection(BattleRulesetsOptions.SectionName));
builder.Services.AddOptions<BattleRulesetsOptions>()
    .Bind(builder.Configuration.GetSection(BattleRulesetsOptions.SectionName))
    .Validate(RulesetsOptionsValidator.Validate)
    .ValidateOnStart();

// Infrastructure — ports
builder.Services.AddScoped<IBattleStateStore, RedisBattleStateStore>();
builder.Services.AddScoped<IBattleRealtimeNotifier, SignalRBattleRealtimeNotifier>();
builder.Services.AddScoped<IBattleEventPublisher, MassTransitBattleEventPublisher>();
builder.Services.AddSingleton<IClock, SystemClock>();
builder.Services.AddScoped<IRulesetProvider, RulesetProvider>();
builder.Services.AddSingleton<ISeedGenerator, SeedGenerator>();

// Infrastructure — SignalR
builder.Services.AddSignalR(options => { options.EnableDetailedErrors = builder.Environment.IsDevelopment(); })
    .AddJsonProtocol(options => { options.PayloadSerializerOptions.Converters.Add(new JsonStringEnumConverter()); });

// Messaging (Kombats.Messaging with transactional outbox — AD-01)
builder.Services.AddMessaging<BattleDbContext>(
    builder.Configuration,
    "battle",
    configureConsumers: bus =>
    {
        bus.AddConsumer<CreateBattleConsumer>();
        bus.AddConsumer<BattleCompletedProjectionConsumer>();
    },
    configure: messagingBuilder =>
    {
        messagingBuilder.Map<CreateBattle>("CreateBattle");
        messagingBuilder.Map<BattleCompleted>("BattleCompleted");
    });

// Background workers
builder.Services.Configure<TurnDeadlineWorkerOptions>(
    builder.Configuration.GetSection("Battle:TurnDeadlineWorker"));
builder.Services.AddHostedService<TurnDeadlineWorker>();

var app = builder.Build();

// NOTE: No Database.MigrateAsync() on startup — AD-13 forbids it.

app.MapOpenApi();
app.MapScalarApiReference();

app.UseHttpsRedirection();

app.UseSerilogRequestLogging();

app.UseCors();

app.UseAuthentication();
app.UseAuthorization();

app.MapEndpoints();
app.MapHub<BattleHub>("/battlehub");

app.Run();
