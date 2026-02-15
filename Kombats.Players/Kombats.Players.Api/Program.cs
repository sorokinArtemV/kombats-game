using System.Reflection;
using Kombats.Infrastructure;
using Kombats.Infrastructure.Configuration;
using Kombats.Players.Api.Extensions;
using Kombats.Players.Application;
using Kombats.Shared.Observability;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

builder.Host.UseSerilog((context, loggerConfig) => loggerConfig.ReadFrom.Configuration(context.Configuration));
builder.Services.AddOpenTelemetryObservability(builder.Configuration);

builder.Services.AddJwtAuthentication(builder.Configuration);

builder.Services.AddValidation(Assembly.GetExecutingAssembly());
builder.Services.AddEndpoints(Assembly.GetExecutingAssembly());

builder.Services.AddAuthorization();

builder.Services.AddSwaggerDocumentation();

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin()
            .AllowAnyMethod()
            .AllowAnyHeader();
    });
});

builder.Services.AddPlayersApplication();
builder.Services.AddPlayersInfrastructure(builder.Configuration);

var app = builder.Build();

app.UseSwaggerDocumentation();

app.UseHttpsRedirection();

app.UseSerilogRequestLogging();

app.UseCors();

app.UseAuthentication();
app.UseAuthorization();

app.MapEndpoints();

app.Run();