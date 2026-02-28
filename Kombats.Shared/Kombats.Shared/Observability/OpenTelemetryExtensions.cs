using Kombats.Shared.Configuration;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;

namespace Kombats.Shared.Observability;

public static class OpenTelemetryExtensions
{
    public static IServiceCollection AddOpenTelemetryObservability(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        services.ConfigureSettings<OpenTelemetryOptions>(configuration, "OpenTelemetry");

        var options = configuration.GetSection("OpenTelemetry").Get<OpenTelemetryOptions>()
                      ?? new OpenTelemetryOptions();

        var resourceBuilder = ResourceBuilder.CreateDefault()
            .AddService(
                options.ServiceName,
                serviceVersion: options.ServiceVersion)
            .AddAttributes(new Dictionary<string, object>
            {
                ["deployment.environment"] =
                    Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Production",
                ["host.name"] = Environment.MachineName
            });

        if (options.EnableTracing)
            services.AddOpenTelemetry()
                .WithTracing(tracing =>
                {
                    tracing.SetResourceBuilder(resourceBuilder);

                    if (options.EnableAspNetCoreInstrumentation)
                        tracing.AddAspNetCoreInstrumentation(aspNetCoreOptions =>
                        {
                            aspNetCoreOptions.RecordException = true;
                            aspNetCoreOptions.Filter = httpContext =>
                            {
                                return !httpContext.Request.Path.StartsWithSegments("/health");
                            };
                        });

                    if (options.EnableHttpClientInstrumentation)
                        tracing.AddHttpClientInstrumentation(httpOptions => { httpOptions.RecordException = true; });


                    if (options.EnableSqlClientInstrumentation)
                        tracing.AddSqlClientInstrumentation(sqlOptions => { sqlOptions.RecordException = true; });

                    if (options.EnableConsoleExporter) tracing.AddConsoleExporter();

                    if (!string.IsNullOrEmpty(options.OtlpEndpoint))
                        tracing.AddOtlpExporter(otlpOptions =>
                        {
                            otlpOptions.Endpoint = new Uri(options.OtlpEndpoint);
                        });
                });

        if (options.EnableMetrics)
            services.AddOpenTelemetry()
                .WithMetrics(metrics =>
                {
                    metrics.SetResourceBuilder(resourceBuilder);

                    if (options.EnableAspNetCoreInstrumentation) metrics.AddAspNetCoreInstrumentation();

                    if (options.EnableHttpClientInstrumentation) metrics.AddHttpClientInstrumentation();

                    if (options.EnableRuntimeInstrumentation) metrics.AddRuntimeInstrumentation();

                    if (options.EnableConsoleExporter) metrics.AddConsoleExporter();

                    if (!string.IsNullOrEmpty(options.OtlpEndpoint))
                        metrics.AddOtlpExporter(otlpOptions =>
                        {
                            otlpOptions.Endpoint = new Uri(options.OtlpEndpoint);
                        });
                });

        return services;
    }
}