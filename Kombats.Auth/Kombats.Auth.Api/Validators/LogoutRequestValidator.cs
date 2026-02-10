using FluentValidation;
using Kombats.Auth.Api.Endpoints.Logout;

namespace Kombats.Auth.Api.Validators;

/// <summary>
/// Validator for LogoutRequest. Validates request shape only (no business logic).
/// </summary>
internal sealed class LogoutRequestValidator : AbstractValidator<LogoutRequest>
{
    public LogoutRequestValidator()
    {
        RuleFor(x => x.RefreshToken)
            .NotEmpty()
            .WithMessage("Refresh token is required.")
            .MinimumLength(1)
            .WithMessage("Refresh token must not be empty.")
            .MaximumLength(500)
            .WithMessage("Refresh token must not exceed 500 characters.");
    }
}

