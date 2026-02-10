using Shared;

namespace Kombats.Auth.Application.UseCases.Refresh;

public record RefreshCommand(string RefreshToken) : ICommand<RefreshResult>;