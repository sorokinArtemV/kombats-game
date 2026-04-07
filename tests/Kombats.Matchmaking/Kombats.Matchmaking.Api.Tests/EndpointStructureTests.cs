using FluentAssertions;
using Kombats.Matchmaking.Api.Endpoints;
using Kombats.Matchmaking.Api.Endpoints.Health;
using Kombats.Matchmaking.Api.Endpoints.Queue;
using Xunit;

namespace Kombats.Matchmaking.Api.Tests;

/// <summary>
/// Verifies that all Matchmaking API endpoints implement IEndpoint
/// and are discoverable via assembly scanning (the pattern used by Bootstrap).
/// </summary>
public sealed class EndpointStructureTests
{
    [Fact]
    public void JoinQueueEndpoint_ImplementsIEndpoint()
    {
        var endpoint = new JoinQueueEndpoint();
        endpoint.Should().BeAssignableTo<IEndpoint>();
    }

    [Fact]
    public void LeaveQueueEndpoint_ImplementsIEndpoint()
    {
        var endpoint = new LeaveQueueEndpoint();
        endpoint.Should().BeAssignableTo<IEndpoint>();
    }

    [Fact]
    public void GetQueueStatusEndpoint_ImplementsIEndpoint()
    {
        var endpoint = new GetQueueStatusEndpoint();
        endpoint.Should().BeAssignableTo<IEndpoint>();
    }

    [Fact]
    public void HealthEndpoint_ImplementsIEndpoint()
    {
        var endpoint = new HealthEndpoint();
        endpoint.Should().BeAssignableTo<IEndpoint>();
    }

    [Fact]
    public void AllEndpoints_AreDiscoverableViaAssemblyScanning()
    {
        var endpointTypes = typeof(IEndpoint).Assembly
            .GetTypes()
            .Where(t => !t.IsAbstract && !t.IsInterface && typeof(IEndpoint).IsAssignableFrom(t))
            .ToList();

        endpointTypes.Should().HaveCount(4, "JoinQueue, LeaveQueue, GetQueueStatus, Health");
        endpointTypes.Should().Contain(t => t.Name == "JoinQueueEndpoint");
        endpointTypes.Should().Contain(t => t.Name == "LeaveQueueEndpoint");
        endpointTypes.Should().Contain(t => t.Name == "GetQueueStatusEndpoint");
        endpointTypes.Should().Contain(t => t.Name == "HealthEndpoint");
    }
}
