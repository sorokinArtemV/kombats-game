using FluentAssertions;
using Kombats.Battle.Application.Models;
using Kombats.Battle.Application.Ports;
using Kombats.Battle.Application.ReadModels;
using Kombats.Battle.Application.UseCases.Turns;
using Kombats.Battle.Domain.Engine;
using Kombats.Battle.Domain.Events;
using Kombats.Battle.Domain.Model;
using Kombats.Battle.Domain.Results;
using Kombats.Battle.Domain.Rules;
using Microsoft.Extensions.Logging;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using Xunit;

namespace Kombats.Battle.Application.Tests.Turns;

public class BattleTurnAppServiceTests
{
    private readonly IBattleStateStore _stateStore = Substitute.For<IBattleStateStore>();
    private readonly IBattleEngine _engine = Substitute.For<IBattleEngine>();
    private readonly IBattleRealtimeNotifier _notifier = Substitute.For<IBattleRealtimeNotifier>();
    private readonly IBattleEventPublisher _publisher = Substitute.For<IBattleEventPublisher>();
    private readonly IActionIntake _actionIntake = Substitute.For<IActionIntake>();
    private readonly IClock _clock = Substitute.For<IClock>();
    private readonly BattleTurnAppService _service;

    private readonly Guid _battleId = Guid.NewGuid();
    private readonly Guid _playerAId = Guid.NewGuid();
    private readonly Guid _playerBId = Guid.NewGuid();

    private static readonly CombatBalance Balance = new(
        hp: new HpBalance(50, 10),
        damage: new DamageBalance(5, 1.0m, 0.3m, 0.2m, 0.8m, 1.2m),
        mf: new MfBalance(2, 2),
        dodgeChance: new ChanceBalance(0.10m, 0.01m, 0.40m, 0.30m, 50m),
        critChance: new ChanceBalance(0.10m, 0.01m, 0.40m, 0.30m, 50m),
        critEffect: new CritEffectBalance(CritEffectMode.Multiplier, 1.5m, 0.5m));

    public BattleTurnAppServiceTests()
    {
        _clock.UtcNow.Returns(DateTimeOffset.UtcNow);
        _service = new BattleTurnAppService(
            _stateStore, _engine, _notifier, _publisher,
            _actionIntake, _clock,
            Substitute.For<ILogger<BattleTurnAppService>>());
    }

    private BattleSnapshot CreateSnapshot(
        BattlePhase phase = BattlePhase.TurnOpen,
        int turnIndex = 1,
        int lastResolved = 0)
    {
        return new BattleSnapshot
        {
            BattleId = _battleId,
            MatchId = Guid.NewGuid(),
            PlayerAId = _playerAId,
            PlayerBId = _playerBId,
            Phase = phase,
            TurnIndex = turnIndex,
            LastResolvedTurnIndex = lastResolved,
            DeadlineUtc = DateTimeOffset.UtcNow.AddSeconds(30),
            Ruleset = Ruleset.Create(1, 30, 10, 42, Balance),
            PlayerAHp = 100,
            PlayerBHp = 100,
            NoActionStreakBoth = 0,
            Version = 1
        };
    }

    // ========== SubmitAction Tests ==========

    [Fact]
    public async Task SubmitAction_BattleNotFound_Throws()
    {
        _stateStore.GetStateAsync(_battleId, Arg.Any<CancellationToken>()).Returns((BattleSnapshot?)null);

        var act = () => _service.SubmitActionAsync(_battleId, _playerAId, 1, "{}", CancellationToken.None);
        await act.Should().ThrowAsync<InvalidOperationException>();
    }

    [Fact]
    public async Task SubmitAction_NonParticipant_Throws()
    {
        _stateStore.GetStateAsync(_battleId, Arg.Any<CancellationToken>()).Returns(CreateSnapshot());

        var act = () => _service.SubmitActionAsync(_battleId, Guid.NewGuid(), 1, "{}", CancellationToken.None);
        await act.Should().ThrowAsync<InvalidOperationException>();
    }

    [Fact]
    public async Task SubmitAction_BattleEnded_Throws()
    {
        _stateStore.GetStateAsync(_battleId, Arg.Any<CancellationToken>())
            .Returns(CreateSnapshot(phase: BattlePhase.Ended));

        var act = () => _service.SubmitActionAsync(_battleId, _playerAId, 1, "{}", CancellationToken.None);
        await act.Should().ThrowAsync<InvalidOperationException>();
    }

    [Fact]
    public async Task SubmitAction_ValidSubmission_StoresAction()
    {
        var snapshot = CreateSnapshot();
        _stateStore.GetStateAsync(_battleId, Arg.Any<CancellationToken>()).Returns(snapshot);

        var command = new PlayerActionCommand
        {
            BattleId = _battleId,
            PlayerId = _playerAId,
            TurnIndex = 1,
            Quality = ActionQuality.Valid,
            AttackZone = BattleZone.Head,
            BlockZonePrimary = BattleZone.Chest,
            BlockZoneSecondary = BattleZone.Belly
        };
        _actionIntake.ProcessAction(_battleId, _playerAId, 1, "{}", snapshot).Returns(command);

        _stateStore.StoreActionAndCheckBothSubmittedAsync(
                Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<Guid>(), Arg.Any<Guid>(), Arg.Any<Guid>(),
                Arg.Any<PlayerActionCommand>(), Arg.Any<CancellationToken>())
            .Returns(new ActionStoreAndCheckResult { StoreResult = ActionStoreResult.Accepted, BothSubmitted = false, WasStored = true });

        await _service.SubmitActionAsync(_battleId, _playerAId, 1, "{}", CancellationToken.None);

        await _stateStore.Received(1).StoreActionAndCheckBothSubmittedAsync(
            _battleId, 1, _playerAId, _playerAId, _playerBId,
            command, Arg.Any<CancellationToken>());
    }

    // ========== ResolveTurn Tests ==========

    [Fact]
    public async Task ResolveTurn_BattleNotFound_ReturnsFalse()
    {
        _stateStore.GetStateAsync(_battleId, Arg.Any<CancellationToken>()).Returns((BattleSnapshot?)null);

        var result = await _service.ResolveTurnAsync(_battleId, CancellationToken.None);
        result.Should().BeFalse();
    }

    [Fact]
    public async Task ResolveTurn_AlreadyResolved_ReturnsFalse()
    {
        _stateStore.GetStateAsync(_battleId, Arg.Any<CancellationToken>())
            .Returns(CreateSnapshot(turnIndex: 1, lastResolved: 1));

        var result = await _service.ResolveTurnAsync(_battleId, CancellationToken.None);
        result.Should().BeFalse();
    }

    [Fact]
    public async Task ResolveTurn_BattleEnded_ReturnsFalse()
    {
        _stateStore.GetStateAsync(_battleId, Arg.Any<CancellationToken>())
            .Returns(CreateSnapshot(phase: BattlePhase.Ended));

        var result = await _service.ResolveTurnAsync(_battleId, CancellationToken.None);
        result.Should().BeFalse();
    }

    [Fact]
    public async Task ResolveTurn_CASFails_ReturnsFalse()
    {
        _stateStore.GetStateAsync(_battleId, Arg.Any<CancellationToken>()).Returns(CreateSnapshot());
        _stateStore.TryMarkTurnResolvingAsync(_battleId, 1, Arg.Any<CancellationToken>()).Returns(false);

        var result = await _service.ResolveTurnAsync(_battleId, CancellationToken.None);
        result.Should().BeFalse();
    }
}
