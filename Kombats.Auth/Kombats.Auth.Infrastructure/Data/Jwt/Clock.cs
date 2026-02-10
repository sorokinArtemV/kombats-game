using Kombats.Auth.Application.Abstractions;

namespace Kombats.Auth.Infrastructure.Data.Jwt;

public sealed class Clock : IClock
{
    public DateTimeOffset UtcNow => DateTimeOffset.UtcNow;
}