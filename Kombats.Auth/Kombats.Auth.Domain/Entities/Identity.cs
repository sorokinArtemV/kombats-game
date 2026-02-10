using Kombats.Auth.Domain.Enums;
using Kombats.Auth.Domain.ValueObjects;

namespace Kombats.Auth.Domain.Entities;

public sealed class Identity
{
    private Identity() { } 

    public Guid Id { get; private set; }
    public Email Email { get; private set; } = null!;
    public string PasswordHash { get; private set; } = null!;
    public IdentityStatus Status { get; private set; }
    public int Version { get; private set; }

    public static Identity Register(Email email, string passwordHash)
    {
        if (string.IsNullOrWhiteSpace(passwordHash))
        {
            throw new ArgumentException("Password hash cannot be null or empty.", nameof(passwordHash));
        }

        return new Identity
        {
            Id = Guid.NewGuid(),
            Email = email,
            PasswordHash = passwordHash,
            Status = IdentityStatus.Active,
            Version = 0
        };
    }
    
    public void Disable()
    {
        if (Status == IdentityStatus.Disabled) return;
        Status = IdentityStatus.Disabled;
        Version++;
    }

    public void ChangePassword(string newPasswordHash)
    {
        if (string.IsNullOrWhiteSpace(newPasswordHash))
            throw new ArgumentException("Password hash cannot be null or empty.", nameof(newPasswordHash));

        PasswordHash = newPasswordHash;
        Version++;
    }
}
