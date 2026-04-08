using FluentAssertions;
using Kombats.Bff.Application.Clients;
using Kombats.Bff.Application.Relay;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using NSubstitute;
using Xunit;

namespace Kombats.Bff.Application.Tests;

public sealed class BattleHubRelayTests
{
    private readonly BattleHubRelay _relay;
    private readonly IFrontendBattleSender _sender;

    public BattleHubRelayTests()
    {
        var options = Options.Create(new ServicesOptions
        {
            Players = new ServiceOptions { BaseUrl = "http://localhost:5001" },
            Matchmaking = new ServiceOptions { BaseUrl = "http://localhost:5002" },
            Battle = new ServiceOptions { BaseUrl = "http://localhost:5003" }
        });

        _sender = Substitute.For<IFrontendBattleSender>();
        var logger = Substitute.For<ILogger<BattleHubRelay>>();

        _relay = new BattleHubRelay(options, _sender, logger);
    }

    [Fact]
    public async Task SubmitTurnActionAsync_WithoutJoin_ThrowsInvalidOperation()
    {
        // Act
        Func<Task> act = () => _relay.SubmitTurnActionAsync(
            "connection-1",
            Guid.NewGuid(),
            0,
            "Attack:Head");

        // Assert
        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*No active battle connection*");
    }

    [Fact]
    public async Task DisconnectAsync_WithoutConnection_DoesNotThrow()
    {
        // Act — disconnecting a non-existent connection should be a no-op
        Func<Task> act = () => _relay.DisconnectAsync("nonexistent-connection");

        // Assert
        await act.Should().NotThrowAsync();
    }

    [Fact]
    public async Task JoinBattleAsync_WithUnreachableBattle_ThrowsAndCleansUp()
    {
        // Arrange — Battle service is not running, so connection will fail
        var options = Options.Create(new ServicesOptions
        {
            Players = new ServiceOptions { BaseUrl = "http://localhost:5001" },
            Matchmaking = new ServiceOptions { BaseUrl = "http://localhost:5002" },
            Battle = new ServiceOptions { BaseUrl = "http://unreachable-host:9999" }
        });

        var sender = Substitute.For<IFrontendBattleSender>();
        var logger = Substitute.For<ILogger<BattleHubRelay>>();
        var relay = new BattleHubRelay(options, sender, logger);

        // Act
        Func<Task> act = () => relay.JoinBattleAsync(
            Guid.NewGuid(),
            "connection-1",
            "fake-jwt-token");

        // Assert — should throw because Battle is unreachable
        await act.Should().ThrowAsync<Exception>();

        // After failure, SubmitTurnAction should also fail (connection cleaned up)
        Func<Task> submitAct = () => relay.SubmitTurnActionAsync(
            "connection-1", Guid.NewGuid(), 0, "Attack:Head");
        await submitAct.Should().ThrowAsync<InvalidOperationException>();
    }

    [Fact]
    public async Task DisposeAsync_CleansUpAllConnections()
    {
        // Act — disposing an empty relay should not throw
        Func<Task> act = async () => await _relay.DisposeAsync();

        // Assert
        await act.Should().NotThrowAsync();
    }

    [Fact]
    public void BattleHubRelay_ImplementsIBattleHubRelay()
    {
        _relay.Should().BeAssignableTo<IBattleHubRelay>();
    }

    [Fact]
    public void BattleHubRelay_ImplementsIAsyncDisposable()
    {
        _relay.Should().BeAssignableTo<IAsyncDisposable>();
    }

    [Fact]
    public void BattleHubRelay_UsesIFrontendBattleSender_NotCallback()
    {
        // Verify the relay constructor requires IFrontendBattleSender
        var ctors = typeof(BattleHubRelay).GetConstructors();
        ctors.Should().HaveCount(1);

        var parameters = ctors[0].GetParameters();
        parameters.Should().Contain(p => p.ParameterType == typeof(IFrontendBattleSender),
            "BattleHubRelay must use IFrontendBattleSender for stable connection targeting");
    }

    [Fact]
    public void IBattleHubRelay_JoinBattleAsync_DoesNotAcceptCallback()
    {
        // Verify the interface does not accept a Func callback parameter
        var method = typeof(IBattleHubRelay).GetMethod("JoinBattleAsync");
        method.Should().NotBeNull();

        var parameters = method!.GetParameters();
        parameters.Should().NotContain(p => p.ParameterType.Name.StartsWith("Func"),
            "JoinBattleAsync must not accept a callback — events are sent via IFrontendBattleSender");
    }
}
