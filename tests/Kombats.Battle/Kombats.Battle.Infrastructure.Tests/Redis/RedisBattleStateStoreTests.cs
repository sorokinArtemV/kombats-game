using FluentAssertions;
using Kombats.Battle.Application.Models;
using Kombats.Battle.Application.Ports;
using Kombats.Battle.Domain.Model;
using Kombats.Battle.Domain.Rules;
using Kombats.Battle.Infrastructure.State.Redis;
using Kombats.Battle.Infrastructure.Tests.Fixtures;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace Kombats.Battle.Infrastructure.Tests.Redis;

[Collection(RedisCollection.Name)]
public class RedisBattleStateStoreTests : IAsyncLifetime
{
    private readonly RedisFixture _fixture;
    private readonly RedisBattleStateStore _store;
    private readonly Guid _battleId = Guid.NewGuid();
    private readonly Guid _matchId = Guid.NewGuid();
    private readonly Guid _playerAId = Guid.NewGuid();
    private readonly Guid _playerBId = Guid.NewGuid();

    private static readonly CombatBalance Balance = new(
        hp: new HpBalance(50, 10),
        damage: new DamageBalance(5, 1.0m, 0.3m, 0.2m, 0.8m, 1.2m),
        mf: new MfBalance(2, 2),
        dodgeChance: new ChanceBalance(0.10m, 0.01m, 0.40m, 0.30m, 50m),
        critChance: new ChanceBalance(0.10m, 0.01m, 0.40m, 0.30m, 50m),
        critEffect: new CritEffectBalance(CritEffectMode.Multiplier, 1.5m, 0.5m));

    private static readonly Ruleset TestRuleset = Ruleset.Create(1, 30, 10, 42, Balance);

    public RedisBattleStateStoreTests(RedisFixture fixture)
    {
        _fixture = fixture;
        var clock = new FakeClock(DateTimeOffset.UtcNow);
        var options = Options.Create(new BattleRedisOptions { ActionTtl = TimeSpan.FromHours(1) });
        _store = new RedisBattleStateStore(
            fixture.Connection,
            NullLogger<RedisBattleStateStore>.Instance,
            options,
            clock);
    }

    public Task InitializeAsync() => _fixture.FlushAsync();
    public Task DisposeAsync() => Task.CompletedTask;

    private BattleDomainState CreateDomainState(
        BattlePhase phase = BattlePhase.ArenaOpen,
        int turnIndex = 0,
        int lastResolved = 0)
    {
        return new BattleDomainState(
            _battleId, _matchId, _playerAId, _playerBId,
            TestRuleset, phase, turnIndex, 0, lastResolved,
            new PlayerState(_playerAId, 100, new PlayerStats(10, 10, 10, 10)),
            new PlayerState(_playerBId, 100, new PlayerStats(10, 10, 10, 10)));
    }

    // ========== Initialization ==========

    [Fact]
    public async Task TryInitialize_NewBattle_ReturnsTrue()
    {
        var state = CreateDomainState();
        var result = await _store.TryInitializeBattleAsync(_battleId, state);
        result.Should().BeTrue();
    }

    [Fact]
    public async Task TryInitialize_DuplicateBattle_ReturnsFalse_Idempotent()
    {
        var state = CreateDomainState();
        await _store.TryInitializeBattleAsync(_battleId, state);

        var duplicate = await _store.TryInitializeBattleAsync(_battleId, state);
        duplicate.Should().BeFalse();
    }

    [Fact]
    public async Task TryInitialize_ThenGet_RoundTripsAllFields()
    {
        var state = CreateDomainState();
        await _store.TryInitializeBattleAsync(_battleId, state);

        var snapshot = await _store.GetStateAsync(_battleId);
        snapshot.Should().NotBeNull();
        snapshot!.BattleId.Should().Be(_battleId);
        snapshot.MatchId.Should().Be(_matchId);
        snapshot.PlayerAId.Should().Be(_playerAId);
        snapshot.PlayerBId.Should().Be(_playerBId);
        snapshot.Phase.Should().Be(BattlePhase.ArenaOpen);
        snapshot.TurnIndex.Should().Be(0);
        snapshot.LastResolvedTurnIndex.Should().Be(0);
        snapshot.Ruleset.Version.Should().Be(1);
        snapshot.PlayerAHp.Should().Be(100);
        snapshot.PlayerBHp.Should().Be(100);
    }

    [Fact]
    public async Task GetState_NonExistent_ReturnsNull()
    {
        var snapshot = await _store.GetStateAsync(Guid.NewGuid());
        snapshot.Should().BeNull();
    }

    // ========== TryOpenTurn CAS ==========

    [Fact]
    public async Task TryOpenTurn_FromArenaOpen_Succeeds()
    {
        await _store.TryInitializeBattleAsync(_battleId, CreateDomainState());
        var deadline = DateTimeOffset.UtcNow.AddSeconds(30);

        var result = await _store.TryOpenTurnAsync(_battleId, 1, deadline);

        result.Should().BeTrue();
        var snapshot = await _store.GetStateAsync(_battleId);
        snapshot!.Phase.Should().Be(BattlePhase.TurnOpen);
        snapshot.TurnIndex.Should().Be(1);
    }

    [Fact]
    public async Task TryOpenTurn_WrongTurnIndex_Fails()
    {
        await _store.TryInitializeBattleAsync(_battleId, CreateDomainState());

        // Try to open turn 2 when LastResolvedTurnIndex is 0 (expects turn 1)
        var result = await _store.TryOpenTurnAsync(_battleId, 2, DateTimeOffset.UtcNow.AddSeconds(30));
        result.Should().BeFalse();
    }

    [Fact]
    public async Task TryOpenTurn_AlreadyTurnOpen_Fails()
    {
        await _store.TryInitializeBattleAsync(_battleId, CreateDomainState());
        await _store.TryOpenTurnAsync(_battleId, 1, DateTimeOffset.UtcNow.AddSeconds(30));

        // Try to open turn 1 again (phase is TurnOpen, not ArenaOpen/Resolving)
        var result = await _store.TryOpenTurnAsync(_battleId, 1, DateTimeOffset.UtcNow.AddSeconds(30));
        result.Should().BeFalse();
    }

    // ========== TryMarkTurnResolving CAS ==========

    [Fact]
    public async Task TryMarkResolving_FromTurnOpen_Succeeds()
    {
        await _store.TryInitializeBattleAsync(_battleId, CreateDomainState());
        await _store.TryOpenTurnAsync(_battleId, 1, DateTimeOffset.UtcNow.AddSeconds(30));

        var result = await _store.TryMarkTurnResolvingAsync(_battleId, 1);

        result.Should().BeTrue();
        var snapshot = await _store.GetStateAsync(_battleId);
        snapshot!.Phase.Should().Be(BattlePhase.Resolving);
    }

    [Fact]
    public async Task TryMarkResolving_WrongTurnIndex_Fails()
    {
        await _store.TryInitializeBattleAsync(_battleId, CreateDomainState());
        await _store.TryOpenTurnAsync(_battleId, 1, DateTimeOffset.UtcNow.AddSeconds(30));

        var result = await _store.TryMarkTurnResolvingAsync(_battleId, 2);
        result.Should().BeFalse();
    }

    [Fact]
    public async Task TryMarkResolving_FromArenaOpen_Fails()
    {
        await _store.TryInitializeBattleAsync(_battleId, CreateDomainState());

        var result = await _store.TryMarkTurnResolvingAsync(_battleId, 1);
        result.Should().BeFalse();
    }

    // ========== MarkTurnResolvedAndOpenNext ==========

    [Fact]
    public async Task ResolveAndOpenNext_FullCycle_UpdatesStateCorrectly()
    {
        await _store.TryInitializeBattleAsync(_battleId, CreateDomainState());
        await _store.TryOpenTurnAsync(_battleId, 1, DateTimeOffset.UtcNow.AddSeconds(30));
        await _store.TryMarkTurnResolvingAsync(_battleId, 1);

        var nextDeadline = DateTimeOffset.UtcNow.AddSeconds(30);
        var result = await _store.MarkTurnResolvedAndOpenNextAsync(
            _battleId, 1, 2, nextDeadline, 0, 80, 90);

        result.Should().BeTrue();
        var snapshot = await _store.GetStateAsync(_battleId);
        snapshot!.Phase.Should().Be(BattlePhase.TurnOpen);
        snapshot.TurnIndex.Should().Be(2);
        snapshot.LastResolvedTurnIndex.Should().Be(1);
        snapshot.PlayerAHp.Should().Be(80);
        snapshot.PlayerBHp.Should().Be(90);
    }

    [Fact]
    public async Task ResolveAndOpenNext_WrongPhase_Fails()
    {
        await _store.TryInitializeBattleAsync(_battleId, CreateDomainState());
        await _store.TryOpenTurnAsync(_battleId, 1, DateTimeOffset.UtcNow.AddSeconds(30));

        // Phase is TurnOpen, not Resolving
        var result = await _store.MarkTurnResolvedAndOpenNextAsync(
            _battleId, 1, 2, DateTimeOffset.UtcNow.AddSeconds(30), 0, 80, 90);
        result.Should().BeFalse();
    }

    // ========== EndBattleAndMarkResolved ==========

    [Fact]
    public async Task EndBattle_FromResolving_ReturnsEndedNow()
    {
        await _store.TryInitializeBattleAsync(_battleId, CreateDomainState());
        await _store.TryOpenTurnAsync(_battleId, 1, DateTimeOffset.UtcNow.AddSeconds(30));
        await _store.TryMarkTurnResolvingAsync(_battleId, 1);

        var result = await _store.EndBattleAndMarkResolvedAsync(_battleId, 1, 0, 0, 100);

        result.Should().Be(EndBattleCommitResult.EndedNow);
        var snapshot = await _store.GetStateAsync(_battleId);
        snapshot!.Phase.Should().Be(BattlePhase.Ended);
        snapshot.LastResolvedTurnIndex.Should().Be(1);
    }

    [Fact]
    public async Task EndBattle_AlreadyEnded_ReturnsAlreadyEnded()
    {
        await _store.TryInitializeBattleAsync(_battleId, CreateDomainState());
        await _store.TryOpenTurnAsync(_battleId, 1, DateTimeOffset.UtcNow.AddSeconds(30));
        await _store.TryMarkTurnResolvingAsync(_battleId, 1);
        await _store.EndBattleAndMarkResolvedAsync(_battleId, 1, 0, 0, 100);

        // Second call — idempotent
        var result = await _store.EndBattleAndMarkResolvedAsync(_battleId, 1, 0, 0, 100);
        result.Should().Be(EndBattleCommitResult.AlreadyEnded);
    }

    [Fact]
    public async Task EndBattle_WrongPhase_ReturnsNotCommitted()
    {
        await _store.TryInitializeBattleAsync(_battleId, CreateDomainState());
        await _store.TryOpenTurnAsync(_battleId, 1, DateTimeOffset.UtcNow.AddSeconds(30));

        // Phase is TurnOpen, not Resolving
        var result = await _store.EndBattleAndMarkResolvedAsync(_battleId, 1, 0, 0, 100);
        result.Should().Be(EndBattleCommitResult.NotCommitted);
    }

    // ========== ClaimDueBattles ==========

    [Fact]
    public async Task ClaimDueBattles_DueBattleInTurnOpen_ClaimSucceeds()
    {
        await _store.TryInitializeBattleAsync(_battleId, CreateDomainState());
        // Open turn with deadline in the past
        var pastDeadline = DateTimeOffset.UtcNow.AddSeconds(-5);
        await _store.TryOpenTurnAsync(_battleId, 1, pastDeadline);

        var claimed = await _store.ClaimDueBattlesAsync(
            DateTimeOffset.UtcNow, 10, TimeSpan.FromSeconds(12));

        claimed.Should().HaveCount(1);
        claimed[0].BattleId.Should().Be(_battleId);
        claimed[0].TurnIndex.Should().Be(1);
    }

    [Fact]
    public async Task ClaimDueBattles_DeadlineInFuture_NoClaim()
    {
        await _store.TryInitializeBattleAsync(_battleId, CreateDomainState());
        var futureDeadline = DateTimeOffset.UtcNow.AddMinutes(5);
        await _store.TryOpenTurnAsync(_battleId, 1, futureDeadline);

        var claimed = await _store.ClaimDueBattlesAsync(
            DateTimeOffset.UtcNow, 10, TimeSpan.FromSeconds(12));

        claimed.Should().BeEmpty();
    }

    [Fact]
    public async Task ClaimDueBattles_EndedBattle_RemovedFromZset()
    {
        await _store.TryInitializeBattleAsync(_battleId, CreateDomainState());
        var pastDeadline = DateTimeOffset.UtcNow.AddSeconds(-5);
        await _store.TryOpenTurnAsync(_battleId, 1, pastDeadline);
        await _store.TryMarkTurnResolvingAsync(_battleId, 1);
        await _store.EndBattleAndMarkResolvedAsync(_battleId, 1, 0, 0, 100);

        var claimed = await _store.ClaimDueBattlesAsync(
            DateTimeOffset.UtcNow, 10, TimeSpan.FromSeconds(12));

        claimed.Should().BeEmpty();
    }

    // ========== StoreActionAndCheckBothSubmitted ==========

    [Fact]
    public async Task StoreAction_FirstSubmission_AcceptedNotBothSubmitted()
    {
        var action = new PlayerActionCommand
        {
            BattleId = _battleId, PlayerId = _playerAId, TurnIndex = 1,
            AttackZone = BattleZone.Head, BlockZonePrimary = BattleZone.Chest,
            BlockZoneSecondary = BattleZone.Belly, Quality = ActionQuality.Valid
        };

        var result = await _store.StoreActionAndCheckBothSubmittedAsync(
            _battleId, 1, _playerAId, _playerAId, _playerBId, action);

        result.StoreResult.Should().Be(ActionStoreResult.Accepted);
        result.BothSubmitted.Should().BeFalse();
        result.WasStored.Should().BeTrue();
    }

    [Fact]
    public async Task StoreAction_BothPlayers_BothSubmittedTrue()
    {
        var actionA = new PlayerActionCommand
        {
            BattleId = _battleId, PlayerId = _playerAId, TurnIndex = 1,
            AttackZone = BattleZone.Head, BlockZonePrimary = BattleZone.Chest,
            BlockZoneSecondary = BattleZone.Belly, Quality = ActionQuality.Valid
        };
        var actionB = new PlayerActionCommand
        {
            BattleId = _battleId, PlayerId = _playerBId, TurnIndex = 1,
            AttackZone = BattleZone.Legs, BlockZonePrimary = BattleZone.Waist,
            BlockZoneSecondary = BattleZone.Belly, Quality = ActionQuality.Valid
        };

        await _store.StoreActionAndCheckBothSubmittedAsync(
            _battleId, 1, _playerAId, _playerAId, _playerBId, actionA);
        var result = await _store.StoreActionAndCheckBothSubmittedAsync(
            _battleId, 1, _playerBId, _playerAId, _playerBId, actionB);

        result.BothSubmitted.Should().BeTrue();
        result.WasStored.Should().BeTrue();
    }

    [Fact]
    public async Task StoreAction_DuplicateSubmission_AlreadySubmitted()
    {
        var action = new PlayerActionCommand
        {
            BattleId = _battleId, PlayerId = _playerAId, TurnIndex = 1,
            AttackZone = BattleZone.Head, BlockZonePrimary = BattleZone.Chest,
            BlockZoneSecondary = BattleZone.Belly, Quality = ActionQuality.Valid
        };

        await _store.StoreActionAndCheckBothSubmittedAsync(
            _battleId, 1, _playerAId, _playerAId, _playerBId, action);
        var duplicate = await _store.StoreActionAndCheckBothSubmittedAsync(
            _battleId, 1, _playerAId, _playerAId, _playerBId, action);

        duplicate.StoreResult.Should().Be(ActionStoreResult.AlreadySubmitted);
        duplicate.WasStored.Should().BeFalse();
    }

    // ========== Multi-turn lifecycle ==========

    [Fact]
    public async Task FullLifecycle_InitOpenResolveContinueEnd_AllTransitionsWork()
    {
        // Init
        await _store.TryInitializeBattleAsync(_battleId, CreateDomainState());

        // Turn 1: open → resolve → open next
        (await _store.TryOpenTurnAsync(_battleId, 1, DateTimeOffset.UtcNow.AddSeconds(30))).Should().BeTrue();
        (await _store.TryMarkTurnResolvingAsync(_battleId, 1)).Should().BeTrue();
        (await _store.MarkTurnResolvedAndOpenNextAsync(_battleId, 1, 2, DateTimeOffset.UtcNow.AddSeconds(30), 0, 80, 90)).Should().BeTrue();

        // Turn 2: open (already open from resolve-and-open) → resolve → end
        (await _store.TryMarkTurnResolvingAsync(_battleId, 2)).Should().BeTrue();
        var endResult = await _store.EndBattleAndMarkResolvedAsync(_battleId, 2, 0, 0, 90);
        endResult.Should().Be(EndBattleCommitResult.EndedNow);

        // Final state
        var snapshot = await _store.GetStateAsync(_battleId);
        snapshot!.Phase.Should().Be(BattlePhase.Ended);
        snapshot.LastResolvedTurnIndex.Should().Be(2);
    }

    // ========== Helpers ==========

    private sealed class FakeClock(DateTimeOffset now) : IClock
    {
        public DateTimeOffset UtcNow => now;
    }
}
