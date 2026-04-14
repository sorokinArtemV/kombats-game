using Testcontainers.Redis;
using Xunit;

namespace Kombats.Chat.Infrastructure.Tests.Fixtures;

/// <summary>
/// Shared Redis Testcontainers fixture for Chat infrastructure tests.
/// Redis operations (presence, rate limiting) will be added in later batches.
/// </summary>
public sealed class RedisFixture : IAsyncLifetime
{
    private RedisContainer _redis = null!;

    public string ConnectionString => _redis.GetConnectionString();

    public async Task InitializeAsync()
    {
        _redis = new RedisBuilder()
            .WithImage("redis:7-alpine")
            .Build();

        await _redis.StartAsync();
    }

    public async Task DisposeAsync()
    {
        await _redis.DisposeAsync();
    }
}

[CollectionDefinition(Name)]
public class RedisCollection : ICollectionFixture<RedisFixture>
{
    public const string Name = "Redis";
}
