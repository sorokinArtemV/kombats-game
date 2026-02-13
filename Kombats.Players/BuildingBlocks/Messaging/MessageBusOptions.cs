namespace BuildingBlocks.Messaging;

public sealed class MessageBusOptions
{
    public const string SectionName = "MessageBus";

    public string Host { get; init; } = "localhost";
    public ushort  Port { get; init; } = 5672;
    public string VirtualHost { get; init; } = "/";

    public string Username { get; init; } = "guest";
    public string Password { get; init; } = "guest";

    public int RetryCount { get; init; } = 3;
    public int RetryIntervalSeconds { get; init; } = 5;

    public int ConcurrentMessageLimit { get; init; } = 10;
    public ushort PrefetchCount { get; init; } = 20;
}