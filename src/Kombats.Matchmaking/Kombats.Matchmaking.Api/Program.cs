using Combats.Infrastructure.Messaging.DependencyInjection;
using Kombats.Matchmaking.Api.Workers;
using Kombats.Matchmaking.Application.Abstractions;
using Kombats.Matchmaking.Application.UseCases;
using Kombats.Matchmaking.Infrastructure;
using Kombats.Matchmaking.Infrastructure.Data;
using Kombats.Matchmaking.Infrastructure.Messaging;
using Kombats.Matchmaking.Infrastructure.Messaging.Consumers;
using Kombats.Matchmaking.Infrastructure.Options;
using Kombats.Matchmaking.Infrastructure.Redis;
using Kombats.Matchmaking.Infrastructure.Repositories;
using Kombats.Battle.Contracts.Battle;
using Kombats.Players.Contracts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Serilog;
using StackExchange.Redis;

var builder = WebApplication.CreateBuilder(args);

builder.Host.UseSerilog((context, services, loggerConfiguration) =>
{
    loggerConfiguration
        .ReadFrom.Configuration(context.Configuration)
        .ReadFrom.Services(services)
        .Enrich.FromLogContext();
});

// Add services to the container
builder.Services.AddControllers();
builder.Services.AddOpenApi();

// Configure PostgreSQL DbContext for Matchmaking service
builder.Services.AddDbContext<MatchmakingDbContext>(options =>
{
    var connectionString = builder.Configuration.GetConnectionString("DefaultConnection")
                           ?? throw new InvalidOperationException("DefaultConnection connection string is required");
    options.UseNpgsql(connectionString);
});

// Configure Redis
var redisConnectionString = builder.Configuration.GetConnectionString("Redis") ?? "localhost:6379";
builder.Services.AddSingleton<IConnectionMultiplexer>(_ => ConnectionMultiplexer.Connect(redisConnectionString));

// Configure Matchmaking Redis options
builder.Services.Configure<MatchmakingRedisOptions>(
    builder.Configuration.GetSection(MatchmakingRedisOptions.SectionName));

// Configure Matchmaking Worker options
builder.Services.Configure<MatchmakingWorkerOptions>(
    builder.Configuration.GetSection(MatchmakingWorkerOptions.SectionName));

// Configure Match Timeout Worker options
builder.Services.Configure<MatchTimeoutWorkerOptions>(
    builder.Configuration.GetSection(MatchTimeoutWorkerOptions.SectionName));

// Configure Outbox Dispatcher options
builder.Services.Configure<OutboxDispatcherOptions>(
    builder.Configuration.GetSection(OutboxDispatcherOptions.SectionName));

// Register Application ports (implemented by Infrastructure)
builder.Services.AddScoped<IMatchQueueStore, RedisMatchQueueStore>();
builder.Services.AddScoped<IPlayerMatchStatusStore, RedisPlayerMatchStatusStore>();
builder.Services.AddScoped<IMatchRepository, MatchRepository>();
builder.Services.AddScoped<IOutboxWriter, OutboxWriter>();
builder.Services.AddScoped<IPlayerCombatProfileRepository, PlayerCombatProfileRepository>();
builder.Services.AddScoped<ITransactionManager, TransactionManager>();

// Register singleton instance ID service
builder.Services.AddSingleton<InstanceIdService>();

// Register Infrastructure services
builder.Services.AddSingleton<RedisLeaseLock>(sp =>
{
    var redis = sp.GetRequiredService<IConnectionMultiplexer>();
    var logger = sp.GetRequiredService<ILogger<RedisLeaseLock>>();
    var redisOptions = sp.GetRequiredService<IOptions<MatchmakingRedisOptions>>();
    return new RedisLeaseLock(redis, logger, redisOptions.Value.DatabaseIndex);
});
builder.Services.AddSingleton<MatchmakingLeaseService>();
builder.Services.AddScoped<OutboxDispatcherService>();

// Register Application services
builder.Services.AddScoped<QueueService>();
builder.Services.AddScoped<MatchmakingService>();

// Configure messaging with typed DbContext for outbox/inbox support
builder.Services.AddMessaging<MatchmakingDbContext>(
    builder.Configuration,
    "matchmaking",
    x =>
    {
        x.AddConsumer<PlayerCombatProfileChangedConsumer>();
        x.AddConsumer<BattleCreatedConsumer>();
        x.AddConsumer<BattleCompletedConsumer>();
    },
    messagingBuilder =>
    {
        messagingBuilder.Map<PlayerCombatProfileChanged>("PlayerCombatProfileChanged");
        messagingBuilder.Map<BattleCreated>("BattleCreated");
        messagingBuilder.Map<BattleCompleted>("BattleCompleted");
    });

// Register background workers
builder.Services.AddHostedService<MatchmakingWorker>();
builder.Services.AddHostedService<MatchTimeoutWorker>();
builder.Services.AddHostedService<OutboxDispatcherWorker>();

var app = builder.Build();

app.UseSerilogRequestLogging();

// Configure the HTTP request pipeline
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();
app.UseRouting();
app.UseAuthorization();
app.MapControllers();

// Ensure database is created/migrated
using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<MatchmakingDbContext>();

    // Apply migrations for MatchmakingDbContext (includes matches table)
    await dbContext.Database.MigrateAsync();
}

app.Run();