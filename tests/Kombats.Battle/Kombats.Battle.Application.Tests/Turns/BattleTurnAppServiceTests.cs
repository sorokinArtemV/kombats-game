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

    private static readonly PlayerStats DefaultStats = new(10, 10, 10, 10);

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

    // ========== Stuck-in-Resolving Recovery Tests ==========

    [Fact]
    public async Task ResolveTurn_StuckInResolving_SkipsCASAndAttemptesRecovery()
    {
        // Battle stuck in Resolving phase — recovery path should skip TryMarkTurnResolvingAsync
        // and proceed directly to action loading. Even if resolution doesn't fully succeed,
        // the key assertion is that TryMarkTurnResolvingAsync is NOT called.
        var resolvingSnapshot = CreateSnapshot(phase: BattlePhase.Resolving, turnIndex: 1);

        // First GetStateAsync call returns Resolving state (validation)
        // Second GetStateAsync call returns null (simulates state disappeared after CAS — causes graceful failure)
        _stateStore.GetStateAsync(_battleId, Arg.Any<CancellationToken>())
            .Returns(resolvingSnapshot, (BattleSnapshot?)null);

        var result = await _service.ResolveTurnAsync(_battleId, CancellationToken.None);

        // Result is false because state disappeared, but the important thing is:
        // TryMarkTurnResolvingAsync was NOT called (recovery skips it)
        result.Should().BeFalse();
        await _stateStore.DidNotReceive().TryMarkTurnResolvingAsync(
            Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task ResolveTurn_InResolvingPhase_DoesNotCallTryMarkResolving()
    {
        // Verify the previous behavior (returning false without recovery) is now replaced
        // by the recovery path which skips CAS
        var resolvingSnapshot = CreateSnapshot(phase: BattlePhase.Resolving, turnIndex: 1);
        _stateStore.GetStateAsync(_battleId, Arg.Any<CancellationToken>())
            .Returns(resolvingSnapshot, (BattleSnapshot?)null);

        await _service.ResolveTurnAsync(_battleId, CancellationToken.None);

        // TryMarkTurnResolvingAsync should never be called when already in Resolving
        await _stateStore.DidNotReceive().TryMarkTurnResolvingAsync(
            Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>());
        // GetActionsAsync should be called (recovery attempted loading actions)
        await _stateStore.Received().GetStateAsync(_battleId, Arg.Any<CancellationToken>());
    }

    // ========== Positive-path: Stuck-in-Resolving recovery succeeds ==========

    [Fact]
    public async Task ResolveTurn_StuckInResolving_RecoverSucceeds_BattleEnds()
    {
        // Arrange: battle stuck in Resolving with valid state and actions
        var resolvingSnapshot = CreateSnapshot(phase: BattlePhase.Resolving, turnIndex: 1);

        // First call: validation (Resolving → recovery path)
        // Second call: reload after CAS skip (returns same state — still exists)
        _stateStore.GetStateAsync(_battleId, Arg.Any<CancellationToken>())
            .Returns(resolvingSnapshot, resolvingSnapshot);

        // Actions exist for both players
        var playerAAction = new PlayerActionCommand
        {
            BattleId = _battleId, PlayerId = _playerAId, TurnIndex = 1,
            Quality = ActionQuality.Valid,
            AttackZone = BattleZone.Head,
            BlockZonePrimary = BattleZone.Chest,
            BlockZoneSecondary = BattleZone.Belly
        };
        var playerBAction = new PlayerActionCommand
        {
            BattleId = _battleId, PlayerId = _playerBId, TurnIndex = 1,
            Quality = ActionQuality.Valid,
            AttackZone = BattleZone.Chest,
            BlockZonePrimary = BattleZone.Head,
            BlockZoneSecondary = BattleZone.Legs
        };
        _stateStore.GetActionsAsync(_battleId, 1, _playerAId, _playerBId, Arg.Any<CancellationToken>())
            .Returns((playerAAction, playerBAction));

        // Engine resolves to battle end (HP knockout)
        var battleEndedEvent = new BattleEndedDomainEvent(
            _battleId, _playerAId, EndBattleReason.Normal, 1, DateTimeOffset.UtcNow);

        var newState = new BattleDomainState(
            _battleId, resolvingSnapshot.MatchId, _playerAId, _playerBId,
            resolvingSnapshot.Ruleset, BattlePhase.Ended, 1, 0, 1,
            new PlayerState(_playerAId, 100, 80, DefaultStats),
            new PlayerState(_playerBId, 100, 0, DefaultStats));

        var resolutionResult = new BattleResolutionResult
        {
            NewState = newState,
            Events = [battleEndedEvent]
        };

        _engine.ResolveTurn(Arg.Any<BattleDomainState>(), Arg.Any<PlayerAction>(), Arg.Any<PlayerAction>())
            .Returns(resolutionResult);

        _stateStore.EndBattleAndMarkResolvedAsync(
                _battleId, 1, Arg.Any<int>(), Arg.Any<int>(), Arg.Any<int>(), Arg.Any<CancellationToken>())
            .Returns(EndBattleCommitResult.EndedNow);

        // Act
        var result = await _service.ResolveTurnAsync(_battleId, CancellationToken.None);

        // Assert
        result.Should().BeTrue();

        // CAS was skipped (recovery path)
        await _stateStore.DidNotReceive().TryMarkTurnResolvingAsync(
            Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>());

        // Engine was called
        _engine.Received(1).ResolveTurn(
            Arg.Any<BattleDomainState>(), Arg.Any<PlayerAction>(), Arg.Any<PlayerAction>());

        // Battle end committed to Redis
        await _stateStore.Received(1).EndBattleAndMarkResolvedAsync(
            _battleId, 1, 0, 80, 0, Arg.Any<CancellationToken>());

        // BattleCompleted event published
        await _publisher.Received(1).PublishBattleCompletedAsync(
            _battleId, resolvingSnapshot.MatchId, _playerAId, _playerBId,
            EndBattleReason.Normal, _playerAId,
            Arg.Any<DateTimeOffset>(),
            Arg.Any<int>(), Arg.Any<int>(), Arg.Any<int>(),
            Arg.Any<CancellationToken>());

        // Client notified
        await _notifier.Received(1).NotifyBattleEndedAsync(
            _battleId, "Normal", _playerAId,
            Arg.Any<DateTimeOffset>(), Arg.Any<CancellationToken>());
    }

    [Fact]
    public async Task ResolveTurn_StuckInResolving_RecoverSucceeds_TurnContinues()
    {
        // Arrange: battle stuck in Resolving, recovery resolves to next turn (not ended)
        var resolvingSnapshot = CreateSnapshot(phase: BattlePhase.Resolving, turnIndex: 1);

        // Snapshot returns: validation, reload after CAS, reload after turn open
        var afterTurnOpenSnapshot = CreateSnapshot(phase: BattlePhase.TurnOpen, turnIndex: 2, lastResolved: 1);
        _stateStore.GetStateAsync(_battleId, Arg.Any<CancellationToken>())
            .Returns(resolvingSnapshot, resolvingSnapshot, afterTurnOpenSnapshot);

        // No actions submitted (NoAction for both)
        _stateStore.GetActionsAsync(_battleId, 1, _playerAId, _playerBId, Arg.Any<CancellationToken>())
            .Returns(((PlayerActionCommand?)null, (PlayerActionCommand?)null));

        // Engine resolves to turn continues
        var turnLog = new TurnResolutionLog
        {
            BattleId = _battleId,
            TurnIndex = 1,
            AtoB = new AttackResolution
            {
                AttackerId = _playerAId, DefenderId = _playerBId, TurnIndex = 1,
                Outcome = AttackOutcome.NoAction, Damage = 0
            },
            BtoA = new AttackResolution
            {
                AttackerId = _playerBId, DefenderId = _playerAId, TurnIndex = 1,
                Outcome = AttackOutcome.NoAction, Damage = 0
            }
        };

        var turnResolvedEvent = new TurnResolvedDomainEvent(
            _battleId, 1,
            PlayerAction.NoAction(_playerAId, 1),
            PlayerAction.NoAction(_playerBId, 1),
            turnLog,
            DateTimeOffset.UtcNow);

        var newState = new BattleDomainState(
            _battleId, resolvingSnapshot.MatchId, _playerAId, _playerBId,
            resolvingSnapshot.Ruleset, BattlePhase.TurnOpen, 2, 1, 1,
            new PlayerState(_playerAId, 100, 100, DefaultStats),
            new PlayerState(_playerBId, 100, 100, DefaultStats));

        var resolutionResult = new BattleResolutionResult
        {
            NewState = newState,
            Events = [turnResolvedEvent]
        };

        _engine.ResolveTurn(Arg.Any<BattleDomainState>(), Arg.Any<PlayerAction>(), Arg.Any<PlayerAction>())
            .Returns(resolutionResult);

        _stateStore.MarkTurnResolvedAndOpenNextAsync(
                _battleId, 1, 2, Arg.Any<DateTimeOffset>(), 1, 100, 100, Arg.Any<CancellationToken>())
            .Returns(true);

        // Act
        var result = await _service.ResolveTurnAsync(_battleId, CancellationToken.None);

        // Assert
        result.Should().BeTrue();

        // CAS was skipped (recovery path)
        await _stateStore.DidNotReceive().TryMarkTurnResolvingAsync(
            Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>());

        // Next turn was opened
        await _stateStore.Received(1).MarkTurnResolvedAndOpenNextAsync(
            _battleId, 1, 2, Arg.Any<DateTimeOffset>(), 1, 100, 100, Arg.Any<CancellationToken>());

        // Client was notified of turn resolution and new turn
        await _notifier.Received(1).NotifyTurnResolvedAsync(
            _battleId, 1, Arg.Any<string>(), Arg.Any<string>(),
            Arg.Any<TurnResolutionLog>(), Arg.Any<CancellationToken>());

        await _notifier.Received(1).NotifyTurnOpenedAsync(
            _battleId, 2, Arg.Any<DateTimeOffset>(), Arg.Any<CancellationToken>());
    }
}
