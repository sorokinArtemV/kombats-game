namespace Kombats.Auth.Infrastructure.Outbox;

public enum OutboxStatus
{
    Pending = 0,
    Processing = 1,
    Processed = 2,
    Failed = 3
}

public static class OutboxStatusExtensions
{
    public static string ToDbString(this OutboxStatus status) => status switch
    {
        OutboxStatus.Pending => "Pending",
        OutboxStatus.Processing => "Processing",
        OutboxStatus.Processed => "Processed",
        OutboxStatus.Failed => "Failed",
        _ => throw new ArgumentOutOfRangeException(nameof(status), status, "Unknown outbox status")
    };
}