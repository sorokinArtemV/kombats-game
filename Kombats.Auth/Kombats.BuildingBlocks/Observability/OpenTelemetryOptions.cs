using System.ComponentModel.DataAnnotations;

namespace Kombats.BuildingBlocks.Observability;

public sealed class OpenTelemetryOptions
{
    [Required]
    public string ServiceName { get; set; } = string.Empty;

    public string ServiceVersion { get; set; } = "1.0.0";

    public string? ApplicationInsightsConnectionString { get; set; }

    public string? OtlpEndpoint { get; set; }

    public bool EnableConsoleExporter { get; set; } = false;

    public bool EnableTracing { get; set; } = true;

    public bool EnableMetrics { get; set; } = true;

    public bool EnableAspNetCoreInstrumentation { get; set; } = true;

    public bool EnableHttpClientInstrumentation { get; set; } = true;

    public bool EnableSqlClientInstrumentation { get; set; } = true;

    public bool EnableRuntimeInstrumentation { get; set; } = true;
}