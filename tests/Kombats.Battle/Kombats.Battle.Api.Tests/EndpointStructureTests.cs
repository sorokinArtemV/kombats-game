using FluentAssertions;
using Kombats.Battle.Api.Endpoints;
using Kombats.Battle.Api.Endpoints.Health;
using Kombats.Battle.Infrastructure.Realtime.SignalR;
using Microsoft.AspNetCore.SignalR;
using Xunit;

namespace Kombats.Battle.Api.Tests;

/// <summary>
/// Verifies Battle API endpoint structure and SignalR hub existence.
/// </summary>
public sealed class EndpointStructureTests
{
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

        endpointTypes.Should().NotBeEmpty();
        endpointTypes.Should().Contain(t => t.Name == "HealthEndpoint");
    }

    [Fact]
    public void BattleHub_ExistsAndExtendsHub()
    {
        typeof(BattleHub).Should().BeAssignableTo<Hub>();
    }

    [Fact]
    public void BattleHub_IsInInfrastructureLayer()
    {
        // BattleHub lives in Infrastructure as a port implementation (SignalR adapter)
        typeof(BattleHub).Namespace.Should().Contain("Infrastructure.Realtime.SignalR");
    }
}
