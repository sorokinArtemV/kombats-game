using Kombats.Auth.Domain.Enums;

namespace Kombats.Auth.Infrastructure.Data;

/// <summary>
/// Persistence DTO for Identity aggregate.
/// Used by Dapper for database mapping.
/// </summary>
internal sealed class IdentityEntity
{
    public Guid Id { get; set; }
    public required string Email { get; set; } 
    public required string PasswordHash { get; set; } 
    public IdentityStatus Status { get; set; }
    public int Version { get; set; }
    public DateTimeOffset? Created { get; set; }
    public DateTimeOffset? Updated { get; set; }
}

