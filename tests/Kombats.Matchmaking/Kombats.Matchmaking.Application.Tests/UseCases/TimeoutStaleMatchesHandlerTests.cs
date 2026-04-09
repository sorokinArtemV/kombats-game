using FluentAssertions;
using Kombats.Matchmaking.Application.Abstractions;
using Kombats.Matchmaking.Application.UseCases.TimeoutStaleMatches;
using Microsoft.Extensions.Logging;
using NSubstitute;
using Xunit;

namespace Kombats.Matchmaking.Application.Tests.UseCases;

public sealed class TimeoutStaleMatchesHandlerTests
{
    private readonly IMatchRepository _matchRepo = Substitute.For<IMatchRepository>();
    private readonly TimeoutStaleMatchesHandler _handler;

    public TimeoutStaleMatchesHandlerTests()
    {
        _handler = new TimeoutStaleMatchesHandler(
            _matchRepo,
            Substitute.For<ILogger<TimeoutStaleMatchesHandler>>());
    }

    [Fact]
    public async Task Handle_NoStaleMatches_ReturnsZero()
    {
        _matchRepo.TimeoutStaleMatchesAsync(Arg.Any<DateTimeOffset>(), Arg.Any<DateTimeOffset>(), Arg.Any<CancellationToken>())
            .Returns(0);
        _matchRepo.TimeoutStaleBattleCreatedMatchesAsync(Arg.Any<DateTimeOffset>(), Arg.Any<DateTimeOffset>(), Arg.Any<CancellationToken>())
            .Returns(0);

        var result = await _handler.HandleAsync(new TimeoutStaleMatchesCommand(60, 600), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().Be(0);
    }

    [Fact]
    public async Task Handle_StaleMatchesExist_ReturnsCombinedCount()
    {
        _matchRepo.TimeoutStaleMatchesAsync(Arg.Any<DateTimeOffset>(), Arg.Any<DateTimeOffset>(), Arg.Any<CancellationToken>())
            .Returns(3);
        _matchRepo.TimeoutStaleBattleCreatedMatchesAsync(Arg.Any<DateTimeOffset>(), Arg.Any<DateTimeOffset>(), Arg.Any<CancellationToken>())
            .Returns(2);

        var result = await _handler.HandleAsync(new TimeoutStaleMatchesCommand(60, 600), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().Be(5);
    }

    [Fact]
    public async Task Handle_PassesCorrectCutoff()
    {
        _matchRepo.TimeoutStaleMatchesAsync(Arg.Any<DateTimeOffset>(), Arg.Any<DateTimeOffset>(), Arg.Any<CancellationToken>())
            .Returns(0);
        _matchRepo.TimeoutStaleBattleCreatedMatchesAsync(Arg.Any<DateTimeOffset>(), Arg.Any<DateTimeOffset>(), Arg.Any<CancellationToken>())
            .Returns(0);

        await _handler.HandleAsync(new TimeoutStaleMatchesCommand(120, 600), CancellationToken.None);

        await _matchRepo.Received(1).TimeoutStaleMatchesAsync(
            Arg.Is<DateTimeOffset>(d => d < DateTimeOffset.UtcNow.AddSeconds(-100)),
            Arg.Is<DateTimeOffset>(d => d <= DateTimeOffset.UtcNow),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_BattleCreatedTimeout_CallsRepository()
    {
        _matchRepo.TimeoutStaleMatchesAsync(Arg.Any<DateTimeOffset>(), Arg.Any<DateTimeOffset>(), Arg.Any<CancellationToken>())
            .Returns(0);
        _matchRepo.TimeoutStaleBattleCreatedMatchesAsync(Arg.Any<DateTimeOffset>(), Arg.Any<DateTimeOffset>(), Arg.Any<CancellationToken>())
            .Returns(1);

        var result = await _handler.HandleAsync(new TimeoutStaleMatchesCommand(60, 600), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().Be(1);
        await _matchRepo.Received(1).TimeoutStaleBattleCreatedMatchesAsync(
            Arg.Is<DateTimeOffset>(d => d < DateTimeOffset.UtcNow.AddSeconds(-580)),
            Arg.Is<DateTimeOffset>(d => d <= DateTimeOffset.UtcNow),
            Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task Handle_BothTimeoutsHaveMatches_ReturnsCombinedCount()
    {
        _matchRepo.TimeoutStaleMatchesAsync(Arg.Any<DateTimeOffset>(), Arg.Any<DateTimeOffset>(), Arg.Any<CancellationToken>())
            .Returns(2);
        _matchRepo.TimeoutStaleBattleCreatedMatchesAsync(Arg.Any<DateTimeOffset>(), Arg.Any<DateTimeOffset>(), Arg.Any<CancellationToken>())
            .Returns(3);

        var result = await _handler.HandleAsync(new TimeoutStaleMatchesCommand(60, 600), CancellationToken.None);

        result.IsSuccess.Should().BeTrue();
        result.Value.Should().Be(5);
    }
}
