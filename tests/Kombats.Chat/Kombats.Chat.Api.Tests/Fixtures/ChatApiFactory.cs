using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Kombats.Chat.Api.Tests.Fixtures;

/// <summary>
/// WebApplicationFactory for Chat API tests. Replaces infrastructure with test
/// doubles so that API-level concerns (auth, validation, middleware) can be tested
/// without PostgreSQL, RabbitMQ, Redis, or Keycloak.
/// </summary>
public sealed class ChatApiFactory : WebApplicationFactory<Program>
{
    public const string TestScheme = "Test";
    public const string TestSubjectId = "d290f1ee-6c54-4b01-90e6-d701748f0851";

    /// <summary>
    /// When true, the test auth handler will authenticate the request.
    /// Set to false to simulate unauthenticated requests.
    /// </summary>
    public bool AuthenticateRequests { get; set; } = true;

    /// <summary>
    /// Override the hosting environment name. Defaults to Development.
    /// </summary>
    public string EnvironmentName { get; set; } = "Development";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(EnvironmentName);

        if (EnvironmentName != "Development")
        {
            builder.ConfigureAppConfiguration((_, config) =>
            {
                config.AddInMemoryCollection(new Dictionary<string, string?>
                {
                    ["Cors:AllowedOrigins:0"] = "https://test.example.com"
                });
            });
        }

        builder.ConfigureTestServices(services =>
        {
            // Replace auth with test scheme
            services.AddAuthentication(TestScheme)
                .AddScheme<AuthenticationSchemeOptions, TestAuthHandler>(TestScheme, null);

            // Pass factory reference so auth handler can read AuthenticateRequests
            services.AddSingleton(this);

            // NOTE: Handler and infrastructure replacements will be added in later batches
            // as Chat application handlers and infrastructure ports are implemented.
        });
    }

    internal sealed class TestAuthHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder,
        ChatApiFactory factory)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!factory.AuthenticateRequests)
            {
                return Task.FromResult(AuthenticateResult.NoResult());
            }

            var claims = new[]
            {
                new Claim("sub", TestSubjectId),
                new Claim("preferred_username", "testuser"),
                new Claim("email", "test@example.com")
            };

            var identity = new ClaimsIdentity(claims, TestScheme);
            var principal = new ClaimsPrincipal(identity);
            var ticket = new AuthenticationTicket(principal, TestScheme);

            return Task.FromResult(AuthenticateResult.Success(ticket));
        }
    }
}
