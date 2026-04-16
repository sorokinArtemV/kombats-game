# Skill: Add EF Entity and Migration

## Steps

### 1. Define domain entity in Domain project

Pure domain type. No EF Core attributes. No infrastructure dependencies.

### 2. Add entity configuration in Infrastructure project

File: `Kombats.<Service>.Infrastructure/Persistence/Configurations/<Entity>Configuration.cs`

```csharp
public class <Entity>Configuration : IEntityTypeConfiguration<<Entity>>
{
    public void Configure(EntityTypeBuilder<<Entity>> builder)
    {
        builder.ToTable("<table_name>", "<schema>");
        builder.HasKey(x => x.Id);
        // Property configurations
        // Concurrency token if needed:
        builder.Property(x => x.Revision).IsConcurrencyToken();
    }
}
```

### 3. Add DbSet to service DbContext

```csharp
public DbSet<<Entity>> <Entities> => Set<<Entity>>();
```

DbContext must:
- Target service schema (`players`, `matchmaking`, or `battle`)
- Use snake_case naming: `options.UseSnakeCaseNamingConvention()`
- Include outbox/inbox table mappings
- Configure `EnableRetryOnFailure()` for production

### 4. Create migration

```bash
dotnet ef migrations add <MigrationName> \
  --startup-project src/Kombats.<Service>/Kombats.<Service>.Bootstrap \
  --project src/Kombats.<Service>/Kombats.<Service>.Infrastructure
```

Migration must:
- Target only its own service schema
- Apply cleanly to an empty database
- Not call `Database.MigrateAsync()` anywhere

### 5. Add repository in Infrastructure project

Implement the port interface defined in Application. Use DbContext directly — no generic repository wrapper.

### 6. Add tests

In `Kombats.<Service>.Infrastructure.Tests`:
- Round-trip: create → save → reload → assert all fields
- Snake_case naming verified (table and column names)
- Schema isolation: writes go to correct schema
- Concurrency token: stale write throws `DbUpdateConcurrencyException`
- Use real PostgreSQL via Testcontainers
- No EF Core in-memory provider

## Checklist

- [ ] Entity in Domain (no EF attributes)
- [ ] Configuration in Infrastructure with schema
- [ ] DbSet added to DbContext
- [ ] Migration created and targets correct schema
- [ ] Repository implements Application port interface
- [ ] No `Database.MigrateAsync()` on startup
- [ ] Integration tests with real PostgreSQL
- [ ] Round-trip test passes
- [ ] Concurrency test if applicable
