# Skill: Cutover and Remove Legacy

## When to Use

When a replacement implementation is verified and it's time to switch from legacy to target code and remove the superseded code.

---

## Cutover Steps

### 1. Verify replacement is complete
- All target-architecture code is implemented and tested
- All mandatory tests pass
- No missing functionality vs. legacy

### 2. Switch executable (if applicable)
- Bootstrap project becomes the service executable
- Legacy Api `Program.cs` is no longer the entry point
- Update `docker-compose.yml` if it references the old project
- Update any launch profiles or scripts

### 3. Switch SDK (if applicable)
- Legacy Api project SDK changes from `Microsoft.NET.Sdk.Web` to `Microsoft.NET.Sdk`
- Only Bootstrap should be `Microsoft.NET.Sdk.Web`

### 4. Verify service starts and responds
- Service starts from Bootstrap
- Health checks pass
- Auth works (JWT validated)
- Endpoints respond correctly
- Consumers process messages

---

## Legacy Removal Steps

### 5. Delete superseded code

Remove in order:
1. **Controllers** — entire `Controllers/` directory in Api
2. **Legacy composition** — `DependencyInjection.cs`, `ServiceCollectionExtensions` in Infrastructure
3. **Legacy Program.cs** — old `Program.cs` in Api (if Bootstrap has the new one)
4. **Legacy middleware** — `DevSignalRAuthMiddleware`, custom auth middleware
5. **Legacy shared references** — remove `Kombats.Shared` project reference from `.csproj`
6. **Legacy workers** — if moved to Bootstrap, delete from Api
7. **Unused DTOs/models** — types only used by deleted Controllers

### 6. Clean up project references
- Remove references to deleted projects
- Remove unused NuGet packages
- Verify no orphan `using` statements

### 7. Build and test
```bash
dotnet build Kombats.sln
dotnet test
```
- Solution must build with zero errors
- All tests must pass
- No warnings about missing references

### 8. Delete `Kombats.Shared` (when last consumer removed)
- If this was the last service referencing `Kombats.Shared`, delete the project entirely
- Remove from solution file
- Remove from any remaining `.csproj` references

### 9. Delete per-service solution files (when all services migrated)
- Delete legacy `.sln` files
- Delete `Kombats.slnx`
- Only `Kombats.sln` (unified) should remain

---

## Verification Checklist

- [ ] Service runs from Bootstrap project
- [ ] No Controllers remain in Api
- [ ] No `DependencyInjection.cs` in Infrastructure
- [ ] No `Kombats.Shared` references from this service
- [ ] No `DevSignalRAuthMiddleware` or dev auth bypasses
- [ ] No `Database.MigrateAsync()` on startup
- [ ] SDK is `Microsoft.NET.Sdk` for Api (not Web)
- [ ] Solution builds
- [ ] All tests pass
- [ ] No dead code, orphan files, or stale references

---

## Common Pitfalls

- Forgetting to update docker-compose project paths
- Leaving `using` statements for deleted namespaces
- Leaving `InternalsVisibleTo` for deleted test projects
- Not checking if `Kombats.Shared` has other consumers before deleting
- Forgetting to remove legacy NuGet packages from `.csproj`
- Leaving legacy `appsettings.json` in Api when Bootstrap has the new one
