using Kombats.Auth.Domain.Entities;
using Kombats.Auth.Domain.ValueObjects;

namespace Kombats.Auth.Application.Abstractions;

/// <summary>
/// Repository for managing identity entities.
/// </summary>
public interface IIdentityRepository
{
    /// <summary>
    /// Adds a new identity to the repository.
    /// </summary>
    /// <param name="identity">The identity to add.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The added identity if successful, otherwise null.</returns>
    public Task<Identity?> AddIdentityAsync(Identity identity, CancellationToken cancellationToken);
    
    /// <summary>
    /// Retrieves an identity by its unique identifier.
    /// </summary>
    /// <param name="id">The unique identifier of the identity.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The identity if found, otherwise null.</returns>
    public Task<Identity?> GetByIdAsync(Guid id, CancellationToken cancellationToken);
    
    /// <summary>
    /// Retrieves an identity by email and password hash.
    /// </summary>
    /// <param name="email">The email address.</param>
    /// <param name="passwordHash">The password hash.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The identity if found, otherwise null.</returns>
    public Task<Identity?> GetByEmailAndPasswordHashAsync(string email, string passwordHash, CancellationToken cancellationToken);
    
    /// <summary>
    /// Finds an identity by email address.
    /// </summary>
    /// <param name="email">The email value object.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The identity if found, otherwise null.</returns>
    public Task<Identity?> FindByEmailAsync(Email email, CancellationToken cancellationToken);
}