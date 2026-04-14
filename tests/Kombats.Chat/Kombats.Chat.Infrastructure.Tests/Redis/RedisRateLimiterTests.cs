using FluentAssertions;
using Kombats.Chat.Infrastructure.Redis;
using Kombats.Chat.Infrastructure.Tests.Fixtures;
using Microsoft.Extensions.Logging.Abstractions;
using StackExchange.Redis;
using Xunit;

namespace Kombats.Chat.Infrastructure.Tests.Redis;

[Collection(RedisCollection.Name)]
public sealed class RedisRateLimiterTests(RedisFixture redisFixture)
{
    private RedisRateLimiter CreateLimiter()
    {
        var mux = ConnectionMultiplexer.Connect(redisFixture.ConnectionString);
        return new RedisRateLimiter(mux, NullLogger<RedisRateLimiter>.Instance);
    }

    private async Task FlushDb()
    {
        var mux = ConnectionMultiplexer.Connect(redisFixture.ConnectionString);
        var server = mux.GetServers()[0];
        await server.FlushDatabaseAsync(2);
    }

    [Fact]
    public async Task UnderLimit_Allowed()
    {
        await FlushDb();
        var limiter = CreateLimiter();
        var id = Guid.NewGuid();

        var result = await limiter.CheckAndIncrementAsync(id, "global", CancellationToken.None);

        result.Allowed.Should().BeTrue();
        result.RetryAfterMs.Should().BeNull();
    }

    [Fact]
    public async Task AtLimit_Denied()
    {
        await FlushDb();
        var limiter = CreateLimiter();
        var id = Guid.NewGuid();

        // Global limit is 5 per 10s
        for (int i = 0; i < 5; i++)
        {
            var r = await limiter.CheckAndIncrementAsync(id, "global", CancellationToken.None);
            r.Allowed.Should().BeTrue();
        }

        var result = await limiter.CheckAndIncrementAsync(id, "global", CancellationToken.None);

        result.Allowed.Should().BeFalse();
        result.RetryAfterMs.Should().BeGreaterThan(0);
    }

    [Fact]
    public async Task DifferentSurfaces_IndependentLimits()
    {
        await FlushDb();
        var limiter = CreateLimiter();
        var id = Guid.NewGuid();

        // Exhaust global limit
        for (int i = 0; i < 5; i++)
            await limiter.CheckAndIncrementAsync(id, "global", CancellationToken.None);

        var globalResult = await limiter.CheckAndIncrementAsync(id, "global", CancellationToken.None);
        var dmResult = await limiter.CheckAndIncrementAsync(id, "dm", CancellationToken.None);

        globalResult.Allowed.Should().BeFalse();
        dmResult.Allowed.Should().BeTrue();
    }

    [Fact]
    public async Task DifferentUsers_IndependentLimits()
    {
        await FlushDb();
        var limiter = CreateLimiter();
        var id1 = Guid.NewGuid();
        var id2 = Guid.NewGuid();

        // Exhaust limit for id1
        for (int i = 0; i < 5; i++)
            await limiter.CheckAndIncrementAsync(id1, "global", CancellationToken.None);

        var result1 = await limiter.CheckAndIncrementAsync(id1, "global", CancellationToken.None);
        var result2 = await limiter.CheckAndIncrementAsync(id2, "global", CancellationToken.None);

        result1.Allowed.Should().BeFalse();
        result2.Allowed.Should().BeTrue();
    }

    [Fact]
    public async Task UnknownSurface_AlwaysAllowed()
    {
        await FlushDb();
        var limiter = CreateLimiter();
        var id = Guid.NewGuid();

        var result = await limiter.CheckAndIncrementAsync(id, "nonexistent", CancellationToken.None);

        result.Allowed.Should().BeTrue();
    }

    [Fact]
    public async Task PresenceLimit_OnePer5Seconds()
    {
        await FlushDb();
        var limiter = CreateLimiter();
        var id = Guid.NewGuid();

        var first = await limiter.CheckAndIncrementAsync(id, "presence", CancellationToken.None);
        var second = await limiter.CheckAndIncrementAsync(id, "presence", CancellationToken.None);

        first.Allowed.Should().BeTrue();
        second.Allowed.Should().BeFalse();
        second.RetryAfterMs.Should().BeGreaterThan(0);
    }
}
