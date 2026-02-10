using System.Reflection;
using Dapper;
using Kombats.Auth.Domain.Abstractions;
using Kombats.Auth.Domain.Entities;
using Kombats.Auth.Domain.ValueObjects;
using Kombats.Auth.Infrastructure.Data;

namespace Kombats.Auth.Infrastructure.Repositories;

public class IdentityRepository : IIdentityRepository
{
  private readonly IDbConnectionFactory _connectionFactory;

  public IdentityRepository(IDbConnectionFactory connectionFactory)
  {
    _connectionFactory = connectionFactory;
  }

  public async Task<Identity?> AddIdentityAsync(Identity identity, CancellationToken cancellationToken)
  {
    const string Query = """
                         INSERT INTO auth."identities" ("id", "email", "password_hash", "status", "version")
                         VALUES (@Id, @Email, @PasswordHash, @Status, @Version)
                         RETURNING id, email, password_hash, status, version, created, updated;
                         """;
    
    var entity = ToEntity(identity);
    
    await using var connection = await _connectionFactory.CreateOpenConnectionAsync();
    var result = await connection.QueryFirstOrDefaultAsync<IdentityEntity>(
      Query, entity);
    
    return result != null ? ToDomain(result) : null;
  }

  public async Task<Identity?> GetByIdAsync(Guid id, CancellationToken cancellationToken)
  {
    const string Query = """
                         SELECT 
                             id,      
                             email,   
                             password_hash,
                             status,
                             version,
                             created,
                             updated
                         FROM auth."identities"
                         WHERE id = @Id;
                         """;
    
    await using var connection = await _connectionFactory.CreateOpenConnectionAsync();
    var entity = await connection.QueryFirstOrDefaultAsync<IdentityEntity>(
      Query, new { Id = id });
    
    return entity != null ? ToDomain(entity) : null;
  }

  public async Task<Identity?> GetByEmailAndPasswordHashAsync(string email, string passwordHash, CancellationToken cancellationToken)
  {
    const string Query = """
                         SELECT 
                             id,      
                             email,   
                             password_hash,
                             status,
                             version,
                             created,
                             updated
                         FROM auth."identities"
                         WHERE email = @Email AND password_hash = @PasswordHash;
                         """;
    
    await using var connection = await _connectionFactory.CreateOpenConnectionAsync();
    var entity = await connection.QueryFirstOrDefaultAsync<IdentityEntity>(
      Query, new { Email = email, PasswordHash = passwordHash });
    
    return entity != null ? ToDomain(entity) : null;
  }

  public async Task<Identity?> FindByEmailAsync(Email email, CancellationToken cancellationToken)
  {
    const string Query = """
                         SELECT 
                             id,      
                             email,   
                             password_hash,
                             status,
                             version,
                             created,
                             updated
                         FROM auth."identities"
                         WHERE email = @Email;
                         """;
    
    await using var connection = await _connectionFactory.CreateOpenConnectionAsync();
    var entity = await connection.QueryFirstOrDefaultAsync<IdentityEntity>(
      Query, new { Email = email.Value });
    
    return entity != null ? ToDomain(entity) : null;
  }

  private static IdentityEntity ToEntity(Identity identity)
  {
    return new IdentityEntity
    {
      Id = identity.Id,
      Email = identity.Email.Value,
      PasswordHash = identity.PasswordHash,
      Status = identity.Status,
      Version = identity.Version
    };
  }

  private static Identity ToDomain(IdentityEntity entity)
  {
    var identity = (Identity)Activator.CreateInstance(typeof(Identity), nonPublic: true)!;
    
    SetPrivateProperty(identity, nameof(Identity.Id), entity.Id);
    SetPrivateProperty(identity, nameof(Identity.Email), Email.Create(entity.Email));
    SetPrivateProperty(identity, nameof(Identity.PasswordHash), entity.PasswordHash);
    SetPrivateProperty(identity, nameof(Identity.Status), entity.Status);
    SetPrivateProperty(identity, nameof(Identity.Version), entity.Version);
    
    return identity;
  }

  private static void SetPrivateProperty(object obj, string propertyName, object? value)
  {
    var property = obj.GetType().GetProperty(propertyName, BindingFlags.Public | BindingFlags.Instance | BindingFlags.NonPublic);
    if (property != null)
    {
      var setMethod = property.GetSetMethod(nonPublic: true);
      setMethod?.Invoke(obj, new[] { value });
    }
  }
}