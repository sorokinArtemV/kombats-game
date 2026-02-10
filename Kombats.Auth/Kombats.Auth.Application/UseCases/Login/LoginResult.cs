namespace Kombats.Auth.Application.UseCases.Login;

public record LoginResult(string AccessToken, string RefreshToken);