using FluentAssertions;
using Kombats.Chat.Infrastructure.Redis;
using Kombats.Chat.Infrastructure.Tests.Fixtures;
using Microsoft.Extensions.Logging.Abstractions;
using StackExchange.Redis;
using Xunit;

namespace Kombats.Chat.Infrastructure.Tests.Redis;

[Collection(RedisCollection.Name)]
public sealed class RedisPresenceStoreTests(RedisFixture redisFixture)
{
    private RedisPresenceStore CreateStore()
    {
        var mux = ConnectionMultiplexer.Connect(redisFixture.ConnectionString);
        return new RedisPresenceStore(mux, NullLogger<RedisPresenceStore>.Instance);
    }

    private async Task FlushDb()
    {
        var mux = ConnectionMultiplexer.Connect(redisFixture.ConnectionString);
        var server = mux.GetServers()[0];
        await server.FlushDatabaseAsync(2);
    }

    [Fact]
    public async Task Connect_FirstConnection_ReturnsTrue()
    {
        await FlushDb();
        var store = CreateStore();
        var id = Guid.NewGuid();

        bool isFirst = await store.ConnectAsync(id, "Player1", CancellationToken.None);

        isFirst.Should().BeTrue();
    }

    [Fact]
    public async Task Connect_SecondConnection_ReturnsFalse()
    {
        await FlushDb();
        var store = CreateStore();
        var id = Guid.NewGuid();

        await store.ConnectAsync(id, "Player1", CancellationToken.None);
        bool isFirst = await store.ConnectAsync(id, "Player1", CancellationToken.None);

        isFirst.Should().BeFalse();
    }

    [Fact]
    public async Task Disconnect_LastConnection_ReturnsTrue()
    {
        await FlushDb();
        var store = CreateStore();
        var id = Guid.NewGuid();

        await store.ConnectAsync(id, "Player1", CancellationToken.None);
        bool isLast = await store.DisconnectAsync(id, CancellationToken.None);

        isLast.Should().BeTrue();
    }

    [Fact]
    public async Task Disconnect_NotLastConnection_ReturnsFalse()
    {
        await FlushDb();
        var store = CreateStore();
        var id = Guid.NewGuid();

        await store.ConnectAsync(id, "Player1", CancellationToken.None);
        await store.ConnectAsync(id, "Player1", CancellationToken.None);

        bool isLast = await store.DisconnectAsync(id, CancellationToken.None);

        isLast.Should().BeFalse();
    }

    [Fact]
    public async Task MultiTab_TwoConnects_DisconnectOne_StillOnline_DisconnectSecond_Offline()
    {
        await FlushDb();
        var store = CreateStore();
        var id = Guid.NewGuid();

        // Two connections
        await store.ConnectAsync(id, "Player1", CancellationToken.None);
        await store.ConnectAsync(id, "Player1", CancellationToken.None);

        // First disconnect — still online
        bool isLast1 = await store.DisconnectAsync(id, CancellationToken.None);
        isLast1.Should().BeFalse();

        bool online = await store.IsOnlineAsync(id, CancellationToken.None);
        online.Should().BeTrue();

        // Second disconnect — offline
        bool isLast2 = await store.DisconnectAsync(id, CancellationToken.None);
        isLast2.Should().BeTrue();

        bool onlineAfter = await store.IsOnlineAsync(id, CancellationToken.None);
        onlineAfter.Should().BeFalse();
    }

    [Fact]
    public async Task Disconnect_AfterTtlExpiry_NoNegativeRefcount()
    {
        await FlushDb();
        var store = CreateStore();
        var id = Guid.NewGuid();

        // Disconnect without connect — refs key doesn't exist
        bool isLast = await store.DisconnectAsync(id, CancellationToken.None);

        // Should return true (cleaning up nonexistent → like last disconnect)
        isLast.Should().BeTrue();

        // Verify no negative refcount
        var mux = ConnectionMultiplexer.Connect(redisFixture.ConnectionString);
        var db = mux.GetDatabase(2);
        var refs = await db.StringGetAsync($"chat:presence:refs:{id}");
        refs.HasValue.Should().BeFalse();
    }

    [Fact]
    public async Task Heartbeat_RenewsTtls()
    {
        await FlushDb();
        var store = CreateStore();
        var id = Guid.NewGuid();

        await store.ConnectAsync(id, "Player1", CancellationToken.None);
        await store.HeartbeatAsync(id, CancellationToken.None);

        // Player should still be online
        bool online = await store.IsOnlineAsync(id, CancellationToken.None);
        online.Should().BeTrue();
    }

    [Fact]
    public async Task Heartbeat_NoRefKey_NoOp()
    {
        await FlushDb();
        var store = CreateStore();
        var id = Guid.NewGuid();

        // Heartbeat without connect — should be a no-op (I5 guard)
        await store.HeartbeatAsync(id, CancellationToken.None);

        bool online = await store.IsOnlineAsync(id, CancellationToken.None);
        online.Should().BeFalse();
    }

    [Fact]
    public async Task GetOnlinePlayers_ReturnsConnectedPlayers()
    {
        await FlushDb();
        var store = CreateStore();

        var id1 = Guid.NewGuid();
        var id2 = Guid.NewGuid();
        await store.ConnectAsync(id1, "Alice", CancellationToken.None);
        await store.ConnectAsync(id2, "Bob", CancellationToken.None);

        var players = await store.GetOnlinePlayersAsync(100, 0, CancellationToken.None);

        players.Should().HaveCount(2);
        players.Should().Contain(p => p.DisplayName == "Alice");
        players.Should().Contain(p => p.DisplayName == "Bob");
    }

    [Fact]
    public async Task GetOnlineCount_ReturnsCorrectCount()
    {
        await FlushDb();
        var store = CreateStore();

        var id1 = Guid.NewGuid();
        var id2 = Guid.NewGuid();
        await store.ConnectAsync(id1, "Alice", CancellationToken.None);
        await store.ConnectAsync(id2, "Bob", CancellationToken.None);

        long count = await store.GetOnlineCountAsync(CancellationToken.None);

        count.Should().Be(2);
    }

    [Fact]
    public async Task GetOnlinePlayers_Pagination_Works()
    {
        await FlushDb();
        var store = CreateStore();

        for (int i = 0; i < 5; i++)
        {
            await store.ConnectAsync(Guid.NewGuid(), $"Player{i}", CancellationToken.None);
        }

        var page1 = await store.GetOnlinePlayersAsync(3, 0, CancellationToken.None);
        var page2 = await store.GetOnlinePlayersAsync(3, 3, CancellationToken.None);

        page1.Should().HaveCount(3);
        page2.Should().HaveCount(2);
    }

    [Fact]
    public async Task IsOnline_ConnectedPlayer_ReturnsTrue()
    {
        await FlushDb();
        var store = CreateStore();
        var id = Guid.NewGuid();

        await store.ConnectAsync(id, "Player1", CancellationToken.None);

        bool online = await store.IsOnlineAsync(id, CancellationToken.None);
        online.Should().BeTrue();
    }

    [Fact]
    public async Task IsOnline_NotConnectedPlayer_ReturnsFalse()
    {
        await FlushDb();
        var store = CreateStore();

        bool online = await store.IsOnlineAsync(Guid.NewGuid(), CancellationToken.None);
        online.Should().BeFalse();
    }
}
