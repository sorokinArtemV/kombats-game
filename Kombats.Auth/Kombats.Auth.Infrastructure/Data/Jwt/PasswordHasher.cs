using Kombats.Auth.Application.Abstractions;

namespace Kombats.Auth.Infrastructure.Data.Jwt;

public sealed class PasswordHasher : IPasswordHasher
{
    private static readonly string DummyHash = BCrypt.Net.BCrypt.HashPassword("timing-dummy");

    public string Hash(string password)
    {
        return BCrypt.Net.BCrypt.HashPassword(password);
    }
    
    public bool Verify(string password, string? hash)
    {
        var targetHash = string.IsNullOrWhiteSpace(hash) ? DummyHash : hash;
        return BCrypt.Net.BCrypt.Verify(password, targetHash);
    }
}