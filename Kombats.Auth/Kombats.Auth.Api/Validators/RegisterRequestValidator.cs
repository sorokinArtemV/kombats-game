using FluentValidation;
using Kombats.Auth.Api.Endpoints.Register;

namespace Kombats.Auth.Api.Validators;

/// <summary>
/// Validator for RegisterRequest. Validates request shape only (no business logic).
/// </summary>
internal sealed class RegisterRequestValidator : AbstractValidator<RegisterRequest>
{
    public RegisterRequestValidator()
    {
        RuleFor(x => x.Email)
            .NotEmpty()
            .WithMessage("Email is required.")
            .EmailAddress()
            .WithMessage("Email must be a valid email address.")
            .MaximumLength(320) // RFC 5321 limit
            .WithMessage("Email must not exceed 320 characters.");

        RuleFor(x => x.Password)
            .NotEmpty()
            .WithMessage("Password is required.")
            .MinimumLength(8)
            .WithMessage("Password must be at least 8 characters long.")
            .MaximumLength(128)
            .WithMessage("Password must not exceed 128 characters.");
    }
}

