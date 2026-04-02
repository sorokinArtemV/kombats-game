using Kombats.Battle.Api.Configuration;
using Kombats.Battle.Api.Middleware;
using Kombats.Battle.Infrastructure.Data.DbContext;
using Kombats.Battle.Infrastructure.Realtime.SignalR;
using Microsoft.EntityFrameworkCore;
using Serilog;
using Serilog.Events;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
        policy
            .AllowAnyOrigin()
            .AllowAnyHeader()
            .AllowAnyMethod());
});

builder.Host.UseSerilog((context, services, loggerConfiguration) =>
{
    loggerConfiguration
        .ReadFrom.Configuration(context.Configuration)
        .ReadFrom.Services(services)
        .Enrich.FromLogContext();
});

builder.Services.AddControllers();

// Register all services
builder.Services.AddBattleDomainServices();
builder.Services.AddBattleApplicationServices();
builder.Services.AddBattleInfrastructure(builder.Configuration, builder.Environment);

var app = builder.Build();

app.UseRouting();

app.UseSerilogRequestLogging(options =>
{
    options.GetLevel = (httpContext, _, ex) =>
    {
        if (ex != null) return LogEventLevel.Error;
        var statusCode = httpContext.Response.StatusCode;
        return statusCode >= 500 ? LogEventLevel.Error
            : statusCode >= 400 ? LogEventLevel.Warning
            : LogEventLevel.Information;
    };

    options.EnrichDiagnosticContext = (diagContext, httpContext) =>
    {
        diagContext.Set("ClientIP", httpContext.Connection.RemoteIpAddress?.ToString());
        diagContext.Set("UserAgent", httpContext.Request.Headers.UserAgent.ToString());
        diagContext.Set("TraceId", httpContext.TraceIdentifier);
    };
});

app.UseCors("AllowAll");

// DEV-ONLY: Add dev SignalR auth middleware (only in Development)
if (app.Environment.IsDevelopment())
{
    app.UseMiddleware<DevSignalRAuthMiddleware>();
}

app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseAuthorization();
app.MapControllers();
app.MapHub<BattleHub>("/battlehub");

// Ensure database is created/migrated
using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<BattleDbContext>();
    await dbContext.Database.MigrateAsync();
}

app.Run();
