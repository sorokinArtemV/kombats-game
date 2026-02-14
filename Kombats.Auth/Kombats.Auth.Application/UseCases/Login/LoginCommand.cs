using Kombats.Shared.Types;

namespace Kombats.Auth.Application.UseCases.Login;

public record LoginCommand(string Email, string Password) : ICommand<LoginResult>;