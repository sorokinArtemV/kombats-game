namespace Kombats.Bff.Application.Clients;

public sealed class ServiceOptions
{
    public required string BaseUrl { get; init; }
}

public sealed class ServicesOptions
{
    public required ServiceOptions Players { get; init; }
    public required ServiceOptions Matchmaking { get; init; }
    public required ServiceOptions Battle { get; init; }
}
