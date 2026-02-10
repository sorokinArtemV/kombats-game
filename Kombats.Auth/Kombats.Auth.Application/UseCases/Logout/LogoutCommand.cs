using Shared;

namespace Kombats.Auth.Application.UseCases.Logout;

public record LogoutCommand(string RefreshToken) : ICommand;