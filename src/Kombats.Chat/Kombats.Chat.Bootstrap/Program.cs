using Kombats.Abstractions;
using Kombats.Abstractions.Auth;
using Kombats.Chat.Api.Endpoints;
using Kombats.Chat.Api.Extensions;
using Kombats.Chat.Api.Hubs;
using Kombats.Chat.Application.Ports;
using Kombats.Chat.Application.Repositories;
using Kombats.Chat.Application.UseCases.ConnectUser;
using Kombats.Chat.Application.UseCases.DisconnectUser;
using Kombats.Chat.Application.UseCases.GetConversationMessages;
using Kombats.Chat.Application.UseCases.GetConversations;
using Kombats.Chat.Application.UseCases.GetDirectMessages;
using Kombats.Chat.Application.UseCases.GetOnlinePlayers;
using Kombats.Chat.Application.UseCases.JoinGlobalChat;
using Kombats.Chat.Application.UseCases.SendDirectMessage;
using Kombats.Chat.Application.UseCases.SendGlobalMessage;
using Kombats.Chat.Infrastructure.Data;
using Kombats.Chat.Infrastructure.Data.Repositories;
using Kombats.Chat.Infrastructure.Redis;
using Kombats.Chat.Infrastructure.Services;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Migrations;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using Serilog;
using StackExchange.Redis;

var builder = WebApplication.CreateBuilder(args);

// Logging
builder.Host.UseSerilog((context, loggerConfig) =>
    loggerConfig.ReadFrom.Configuration(context.Configuration));

// Authentication & Authorization
builder.Services.AddKombatsAuth(builder.Configuration);
builder.Services.AddHttpContextAccessor();

// Validation & Endpoints (scan Api assembly)
var apiAssembly = typeof(IEndpoint).Assembly;
builder.Services.AddEndpoints(apiAssembly);

// API Documentation
builder.Services.AddApiDocumentation();

// CORS
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        if (builder.Environment.IsDevelopment())
        {
            policy.AllowAnyOrigin()
                .AllowAnyMethod()
                .AllowAnyHeader();
        }
        else
        {
            var origins = builder.Configuration
                .GetSection("Cors:AllowedOrigins")
                .Get<string[]>();

            if (origins is null || origins.Length == 0)
                throw new InvalidOperationException(
                    "Cors:AllowedOrigins must be configured in non-Development environments. " +
                    "Set it to an array of allowed origin URLs in appsettings.json.");

            policy.WithOrigins(origins)
                .AllowAnyMethod()
                .AllowAnyHeader();
        }
    });
});

// Health checks
var postgresConnection = builder.Configuration.GetConnectionString("PostgresConnection")
    ?? "Host=localhost;Port=5432;Database=kombats;Username=postgres;Password=postgres";
builder.Services.AddHealthChecks()
    .AddNpgSql(postgresConnection, name: "postgresql");

// OpenTelemetry tracing
builder.Services.AddOpenTelemetry()
    .ConfigureResource(resource => resource.AddService("Kombats.Chat"))
    .WithTracing(tracing =>
    {
        tracing
            .AddAspNetCoreInstrumentation()
            .AddHttpClientInstrumentation()
            .AddSource("Npgsql");

        string? otlpEndpoint = builder.Configuration["OpenTelemetry:OtlpEndpoint"];
        if (!string.IsNullOrEmpty(otlpEndpoint))
        {
            tracing.AddOtlpExporter(options => options.Endpoint = new Uri(otlpEndpoint));
        }
    });

// === Batch 1: EF Core + Repositories + Handlers ===

builder.Services.AddDbContext<ChatDbContext>(options =>
{
    options
        .UseNpgsql(builder.Configuration.GetConnectionString("PostgresConnection"), npgsql =>
        {
            npgsql.MigrationsHistoryTable("__ef_migrations_history", ChatDbContext.Schema);
            npgsql.EnableRetryOnFailure();
        })
        .UseSnakeCaseNamingConvention()
        .ReplaceService<IHistoryRepository, SnakeCaseHistoryRepository>();
});

// Application handlers (Batch 1: read-path only)
builder.Services.AddScoped<IQueryHandler<GetConversationMessagesQuery, GetConversationMessagesResponse>, GetConversationMessagesHandler>();
builder.Services.AddScoped<IQueryHandler<GetConversationsQuery, GetConversationsResponse>, GetConversationsHandler>();
builder.Services.AddScoped<IQueryHandler<GetDirectMessagesQuery, GetConversationMessagesResponse>, GetDirectMessagesHandler>();

// Infrastructure repositories
builder.Services.AddScoped<IConversationRepository, ConversationRepository>();
builder.Services.AddScoped<IMessageRepository, MessageRepository>();

// === Batch 2: Redis + Presence + Rate Limiter + Player Info + Resolvers ===

// Redis connection (DB 2 for Chat)
var redisConnectionString = builder.Configuration.GetConnectionString("Redis") ?? "localhost:6379,abortConnect=false";
builder.Services.AddSingleton<IConnectionMultiplexer>(_ =>
    ConnectionMultiplexer.Connect(redisConnectionString));

// Redis port implementations
builder.Services.AddScoped<IPresenceStore, RedisPresenceStore>();
builder.Services.AddScoped<IRateLimiter, RedisRateLimiter>();
builder.Services.AddScoped<IPlayerInfoCache, RedisPlayerInfoCache>();

// HTTP client for Players service
builder.Services.AddHttpClient("Players", client =>
{
    var playersBaseUrl = builder.Configuration["Players:BaseUrl"] ?? "http://localhost:5000";
    client.BaseAddress = new Uri(playersBaseUrl);
    client.Timeout = TimeSpan.FromSeconds(5);
});

// Application services
builder.Services.AddScoped<IDisplayNameResolver, DisplayNameResolver>();
builder.Services.AddScoped<IEligibilityChecker, EligibilityChecker>();

// Application handler (Batch 2: online players query)
builder.Services.AddScoped<IQueryHandler<GetOnlinePlayersQuery, GetOnlinePlayersResponse>, GetOnlinePlayersHandler>();

// === Batch 3: SignalR hub + chat command handlers + filters ===

builder.Services.AddSingleton(TimeProvider.System);

// Filters / restriction
builder.Services.AddScoped<IMessageFilter, MessageFilter>();
builder.Services.AddScoped<IUserRestriction, UserRestriction>();

// Chat command handlers
builder.Services.AddScoped<ICommandHandler<ConnectUserCommand>, ConnectUserHandler>();
builder.Services.AddScoped<ICommandHandler<DisconnectUserCommand>, DisconnectUserHandler>();
builder.Services.AddScoped<ICommandHandler<JoinGlobalChatCommand, JoinGlobalChatResponse>, JoinGlobalChatHandler>();
builder.Services.AddScoped<ICommandHandler<SendGlobalMessageCommand>, SendGlobalMessageHandler>();
builder.Services.AddScoped<ICommandHandler<SendDirectMessageCommand, SendDirectMessageResponse>, SendDirectMessageHandler>();

// SignalR + chat notifier (singleton scope: hub context is safe to capture)
builder.Services.AddSignalR();
builder.Services.AddSingleton<IChatNotifier, SignalRChatNotifier>();
builder.Services.AddSingleton<HeartbeatScheduler>();

// NOTE: Messaging (MassTransit) and background workers will be added in Batch 4.

var app = builder.Build();

// NOTE: No Database.MigrateAsync() on startup — AD-13 forbids it.

app.UseMiddleware<Kombats.Chat.Api.Middleware.ExceptionHandlingMiddleware>();

app.UseApiDocumentation();

app.UseHttpsRedirection();

app.UseSerilogRequestLogging();

app.UseCors();

app.UseAuthentication();
app.UseAuthorization();

app.MapEndpoints();

app.MapHub<InternalChatHub>("/chathub-internal");

app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false }).AllowAnonymous();
app.MapHealthChecks("/health/ready").AllowAnonymous();

app.Run();

// Required for WebApplicationFactory<Program> in API tests.
public partial class Program;
