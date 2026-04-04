using System.Reflection;
using Kombats.Players.Infrastructure;
using Kombats.Players.Infrastructure.Messaging.Consumers;
using Kombats.Players.Api.Extensions;
using Kombats.Players.Application;
using Kombats.Shared.Messaging;
using Kombats.Shared.Observability;
using Microsoft.EntityFrameworkCore;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

builder.Host.UseSerilog((context, loggerConfig) => loggerConfig.ReadFrom.Configuration(context.Configuration));
builder.Services.AddOpenTelemetryObservability(builder.Configuration);

builder.Services.AddJwtAuthentication(builder.Configuration);
builder.Services.AddCurrentIdentity();

builder.Services.AddValidation(Assembly.GetExecutingAssembly());
builder.Services.AddEndpoints(Assembly.GetExecutingAssembly());

builder.Services.AddApiDocumentation();

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

builder.Services.Configure<Kombats.Players.Infrastructure.Configuration.LevelingOptions>(
    builder.Configuration.GetSection("Leveling"));

builder.Services.AddPlayersApplication();
builder.Services.AddPlayersInfrastructure(builder.Configuration);
builder.Services.AddMessageBus(builder.Configuration, configureConsumers: bus =>
{
    bus.AddConsumer<BattleCompletedConsumer>();
});

var app = builder.Build();

// Ensure database is created/migrated
using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<Kombats.Players.Infrastructure.Data.PlayersDbContext>();
    await dbContext.Database.MigrateAsync();
}

app.UseApiDocumentation();

app.UseHttpsRedirection();

app.UseSerilogRequestLogging();

app.UseCors();

app.UseAuthentication();
app.UseAuthorization();

app.MapEndpoints();
app.Run();
