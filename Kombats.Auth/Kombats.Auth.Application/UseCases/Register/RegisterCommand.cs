using Shared;

namespace Kombats.Auth.Application.UseCases.Register;

public record RegisterCommand(string Email, string Password) : ICommand<RegisterResult>;