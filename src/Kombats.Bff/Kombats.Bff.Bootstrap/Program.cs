using System.Reflection;
using Kombats.Bff.Api.Extensions;
using Kombats.Bff.Api.Hubs;
using Kombats.Bff.Application.Clients;
using Kombats.Bff.Application.Composition;
using Kombats.Bff.Application.Errors;
using Kombats.Bff.Application.Relay;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Scalar.AspNetCore;
using Serilog;

WebApplicationBuilder builder = WebApplication.CreateBuilder(args);

// Logging
builder.Host.UseSerilog((context, loggerConfig) =>
    loggerConfig.ReadFrom.Configuration(context.Configuration));

// Authentication & Authorization (inlined — BFF does not reference Kombats.Abstractions per AD-17)
string authority = builder.Configuration["Keycloak:Authority"]
                   ?? throw new InvalidOperationException("Keycloak:Authority configuration is required.");
string audience = builder.Configuration["Keycloak:Audience"]
                  ?? throw new InvalidOperationException("Keycloak:Audience configuration is required.");

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = authority;
        options.Audience = audience;
        options.RequireHttpsMetadata = false;
        options.TokenValidationParameters.NameClaimType = "preferred_username";

        // SignalR sends the token as a query string parameter for WebSocket connections
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                string? accessToken = context.Request.Query["access_token"];
                string path = context.HttpContext.Request.Path;

                if (!string.IsNullOrEmpty(accessToken) && path.StartsWith("/battlehub"))
                {
                    context.Token = accessToken;
                }

                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();

// Endpoints (scan Api assembly)
Assembly apiAssembly = typeof(Kombats.Bff.Api.Endpoints.IEndpoint).Assembly;
builder.Services.AddEndpoints(apiAssembly);

// API Documentation
builder.Services.AddOpenApi("v1");

// CORS
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        if (builder.Environment.IsDevelopment())
        {
            policy.SetIsOriginAllowed(_ => true)
                .AllowAnyMethod()
                .AllowAnyHeader()
                .AllowCredentials();
        }
        else
        {
            string[]? origins = builder.Configuration
                .GetSection("Cors:AllowedOrigins")
                .Get<string[]>();

            if (origins is null || origins.Length == 0)
            {
                throw new InvalidOperationException(
                    "Cors:AllowedOrigins must be configured in non-Development environments.");
            }

            policy.WithOrigins(origins)
                .AllowAnyMethod()
                .AllowAnyHeader()
                .AllowCredentials();
        }
    });
});

// Service options
builder.Services.Configure<ServicesOptions>(builder.Configuration.GetSection("Services"));

// HttpContext accessor (required by JwtForwardingHandler)
builder.Services.AddHttpContextAccessor();

// JWT forwarding handler
builder.Services.AddTransient<JwtForwardingHandler>();

// Typed HttpClients — Players
builder.Services.AddHttpClient<IPlayersClient, PlayersClient>(client =>
{
    string baseUrl = builder.Configuration["Services:Players:BaseUrl"]
        ?? throw new InvalidOperationException("Services:Players:BaseUrl is required.");
    client.BaseAddress = new Uri(baseUrl);
}).AddHttpMessageHandler<JwtForwardingHandler>();

// Typed HttpClients — Matchmaking
builder.Services.AddHttpClient<IMatchmakingClient, MatchmakingClient>(client =>
{
    string baseUrl = builder.Configuration["Services:Matchmaking:BaseUrl"]
        ?? throw new InvalidOperationException("Services:Matchmaking:BaseUrl is required.");
    client.BaseAddress = new Uri(baseUrl);
}).AddHttpMessageHandler<JwtForwardingHandler>();

// SignalR — frontend-facing hub
builder.Services.AddSignalR();

// Frontend event sender — uses IHubContext<BattleHub> to target connections by ID.
// IHubContext is stable outside hub method scope (unlike Hub.Clients.Caller).
builder.Services.AddSingleton<IFrontendBattleSender, HubContextBattleSender>();

// Battle hub relay — manages per-connection downstream SignalR connections to Battle
builder.Services.AddSingleton<IBattleHubRelay, BattleHubRelay>();

WebApplication app = builder.Build();

app.MapOpenApi();
app.MapScalarApiReference();

app.UseHttpsRedirection();

app.UseSerilogRequestLogging();

app.UseCors();

app.UseAuthentication();
app.UseAuthorization();

// Global error handler for BFF exceptions
app.Use(async (context, next) =>
{
    try
    {
        await next();
    }
    catch (BffServiceException ex)
    {
        context.Response.StatusCode = (int)ex.StatusCode;
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsJsonAsync(new BffErrorResponse(ex.Error));
    }
    catch (ServiceUnavailableException ex)
    {
        context.Response.StatusCode = 503;
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsJsonAsync(new BffErrorResponse(
            new BffError(BffErrorCode.ServiceUnavailable, ex.Message)));
    }
});

app.MapEndpoints();

// SignalR hub — battle realtime proxy (AD-16)
app.MapHub<BattleHub>("/battlehub");

app.Run();
