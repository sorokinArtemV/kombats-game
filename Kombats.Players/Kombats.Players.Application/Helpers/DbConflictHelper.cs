using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Kombats.Players.Application.Helpers;

/// <summary>
/// Thin helper to inspect DbUpdateException for specific Postgres unique-constraint violations.
/// Keeps handlers free of repeated Npgsql plumbing.
/// </summary>
internal static class DbConflictHelper
{
    public const string IdentityIdUniqueIndex = "ix_characters_identity_id";
    public const string NameNormalizedUniqueIndex = "ix_characters_name_normalized";

    private const string UniqueViolationSqlState = "23505";

    public static bool IsUniqueViolation(DbUpdateException ex, string constraintName)
    {
        return ex.InnerException is PostgresException pg
               && pg.SqlState == UniqueViolationSqlState
               && string.Equals(pg.ConstraintName, constraintName, StringComparison.OrdinalIgnoreCase);
    }

    public static bool IsAnyUniqueViolation(DbUpdateException ex)
    {
        return ex.InnerException is PostgresException pg
               && pg.SqlState == UniqueViolationSqlState;
    }
}
