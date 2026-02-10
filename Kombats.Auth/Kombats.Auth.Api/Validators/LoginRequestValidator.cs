using FluentValidation;
using Kombats.Auth.Api.Endpoints.Login;

namespace Kombats.Auth.Api.Validators;

/// <summary>
/// Validator for LoginRequest. Validates request shape only (no business logic).
/// </summary>
internal sealed class LoginRequestValidator : AbstractValidator<LoginRequest>
{
    public LoginRequestValidator()
    {
        RuleFor(x => x.Email)
            .NotEmpty()
            .WithMessage("Email is required.")
            .EmailAddress()
            .WithMessage("Email must be a valid email address.")
            .MaximumLength(320) 
            .WithMessage("Email must not exceed 320 characters.");

        RuleFor(x => x.Password)
            .NotEmpty()
            .WithMessage("Password is required.")
            .MinimumLength(1)
            .WithMessage("Password must not be empty.")
            .MaximumLength(128)
            .WithMessage("Password must not exceed 128 characters.");
    }
}

