

using Kombats.Shared.Types;

namespace Kombats.Auth.Application.UseCases.Logout;

public record LogoutCommand(string RefreshToken) : ICommand;