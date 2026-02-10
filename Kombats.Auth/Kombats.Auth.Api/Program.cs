using System.Reflection;
using Kombats.Auth.Api.Extensions;
using Kombats.Auth.Application;
using Kombats.Auth.Infrastructure;
using Kombats.BuildingBlocks.Messaging;
using Kombats.BuildingBlocks.Messaging.Outbox;
using Kombats.BuildingBlocks.Observability;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

builder.Host.UseSerilog((context, loggerConfig) => loggerConfig.ReadFrom.Configuration(context.Configuration));
builder.Services.AddOpenTelemetryObservability(builder.Configuration);

builder.Services.AddMessageBus(builder.Configuration);

builder.Services.AddJwtAuthentication(builder.Configuration);

builder.Services.AddValidation(Assembly.GetExecutingAssembly());
builder.Services.AddEndpoints(Assembly.GetExecutingAssembly());

builder.Services.AddAuthorization();

builder.Services.AddOpenApi();

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin()
            .AllowAnyMethod()
            .AllowAnyHeader();
    });
});

builder.Services.AddSwaggerDocumentation();

builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration);

builder.Services.AddHostedService<OutboxDispatcherHostedService>();

var app = builder.Build();

app.UseSwaggerDocumentation();

app.UseHttpsRedirection();

app.UseSerilogRequestLogging();

app.UseCors();

app.UseAuthentication();
app.UseAuthorization();

app.MapEndpoints();

app.Run();