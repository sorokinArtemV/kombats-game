using Kombats.Abstractions.Auth;
using Kombats.Chat.Api.Endpoints;
using Kombats.Chat.Api.Extensions;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using Serilog;

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

// NOTE: Messaging, DbContext, Redis, and handler registration will be added in later batches.

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

app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false }).AllowAnonymous();
app.MapHealthChecks("/health/ready").AllowAnonymous();

app.Run();

// Required for WebApplicationFactory<Program> in API tests.
public partial class Program;
