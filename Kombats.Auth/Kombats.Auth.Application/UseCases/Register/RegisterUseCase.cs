using Kombats.Auth.Application.Abstractions;
using Kombats.Auth.Domain.Entities;
using Kombats.Auth.Domain.ValueObjects;
using Microsoft.Extensions.Logging;
using System.Text.Json;
using Kombats.Shared.Events;
using Kombats.Shared.Types;

namespace Kombats.Auth.Application.UseCases.Register;

public sealed class RegisterUseCase : ICommandHandler<RegisterCommand, RegisterResult>
{
    private readonly IClock _clock;
    private readonly IIdentityRepository _identityRepository;
    private readonly ILogger<RegisterUseCase> _logger;
    private readonly IPasswordHasher _passwordHasher;
    private readonly ITransactionalUnitOfWork _unitOfWork;

    public RegisterUseCase(
        IIdentityRepository identityRepository,
        IPasswordHasher passwordHasher,
        ITransactionalUnitOfWork unitOfWork,
        IClock clock,
        ILogger<RegisterUseCase> logger)
    {
        _identityRepository = identityRepository;
        _passwordHasher = passwordHasher;
        _unitOfWork = unitOfWork;
        _clock = clock;
        _logger = logger;
    }

    public async Task<Result<RegisterResult>> HandleAsync(RegisterCommand command, CancellationToken cancellationToken)
    {
        Email email;
        try
        {
            email = Email.Create(command.Email);
        }
        catch (ArgumentException ex)
        {
            return Result.Failure<RegisterResult>(Error.Validation("Register.InvalidEmail", ex.Message));
        }

        if (string.IsNullOrWhiteSpace(command.Password))
        {
            return Result.Failure<RegisterResult>(Error.Validation("Register.PasswordRequired", "Password is required."));
        }

        var existingIdentity = await _identityRepository.FindByEmailAsync(email, cancellationToken);
        if (existingIdentity != null)
        {
            _logger.LogWarning("Registration failed: email already exists {Email}", email.Value);
            return Result.Failure<RegisterResult>(Error.Conflict("Register.EmailAlreadyExists", "An account with this email already exists."));
        }

        var passwordHash = _passwordHasher.Hash(command.Password);
        var identity = Identity.Register(email, passwordHash);
        
        var @event = new IdentityRegisteredEvent(
            identity.Id,
            identity.Email.Value,
            _clock.UtcNow);

        var eventPayload = JsonSerializer.Serialize(new
        {
            identityId = identity.Id,
            email = identity.Email.Value
        });
        var outboxMessage = new OutboxEnvelope(
            Id: Guid.NewGuid(),
            OccurredAt: _clock.UtcNow,
            Type: EventType.IdentityRegistered,
            Payload: eventPayload);
        
        await _unitOfWork.CreateIdentityWithOutboxAsync(identity, outboxMessage, cancellationToken);

        _logger.LogInformation("Registration successful for identity {IdentityId}", identity.Id);

        return Result.Success(new RegisterResult(identity.Id));
    }
}