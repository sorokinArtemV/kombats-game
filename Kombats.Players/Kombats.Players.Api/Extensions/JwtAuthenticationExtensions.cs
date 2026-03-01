using System.Text.Json;
using Kombats.Players.Api.Auth;
using Kombats.Shared.Configuration;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace Kombats.Players.Api.Extensions;

public static class JwtAuthenticationExtensions
{
    public static IServiceCollection AddJwtAuthentication(this IServiceCollection services,
        IConfiguration configuration)
    {
        services.ConfigureSettings<KeycloakAuthOptions>(configuration, KeycloakAuthOptions.SectionName);

        services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.Authority = configuration["Auth:Authority"];
                options.RequireHttpsMetadata = configuration.GetValue<bool>("Auth:RequireHttpsMetadata");

                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer = true,
                    ValidIssuer = configuration["Auth:Authority"],

                    ValidateAudience = true,
                    ValidAudience = configuration["Auth:Audience"],

                    ValidateLifetime = true
                };
            });

        services.AddAuthorization();

        return services;
    }

    private sealed class ConfigureJwtBearerOptions : IPostConfigureOptions<JwtBearerOptions>
    {
        private readonly IOptions<KeycloakAuthOptions> _authOptions;
        private readonly ILogger<ConfigureJwtBearerOptions> _logger;

        public ConfigureJwtBearerOptions(
            IOptions<KeycloakAuthOptions> authOptions,
            ILogger<ConfigureJwtBearerOptions> logger)
        {
            _authOptions = authOptions;
            _logger = logger;
        }

        public void PostConfigure(string? name, JwtBearerOptions options)
        {
            if (name != JwtBearerDefaults.AuthenticationScheme)
            {
                return;
            }

            var auth = _authOptions.Value;

            _logger.LogInformation(
                "Configuring Keycloak JWT Bearer — Authority={Authority}, Audience={Audience}, RequireHttps={RequireHttps}",
                auth.Authority, auth.Audience, auth.RequireHttpsMetadata);

            options.MapInboundClaims = false;
            options.Authority = auth.Authority;
            options.Audience = auth.Audience;
            options.RequireHttpsMetadata = auth.RequireHttpsMetadata;

            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = true,
                ValidateIssuerSigningKey = true,
                NameClaimType = "sub"
            };

            options.Events = new JwtBearerEvents
            {
                OnAuthenticationFailed = context =>
                {
                    _logger.LogWarning(
                        context.Exception,
                        "JWT authentication failed: {Error}",
                        context.Exception.Message);
                    return Task.CompletedTask;
                },

                OnChallenge = context =>
                {
                    if (context.AuthenticateFailure is not null)
                    {
                        _logger.LogWarning(
                            "JWT challenge issued: {Error} {ErrorDescription}",
                            context.Error, context.ErrorDescription);
                    }

                    context.HandleResponse();

                    context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                    context.Response.ContentType = "application/problem+json";

                    var problem = new
                    {
                        type = "https://tools.ietf.org/html/rfc7235#section-3.1",
                        title = "Unauthorized",
                        status = 401,
                        detail = context.ErrorDescription ?? "Bearer token is missing or invalid."
                    };

                    return context.Response.WriteAsync(
                        JsonSerializer.Serialize(problem));
                },

                OnForbidden = context =>
                {
                    context.Response.StatusCode = StatusCodes.Status403Forbidden;
                    context.Response.ContentType = "application/problem+json";

                    var problem = new
                    {
                        type = "https://tools.ietf.org/html/rfc7235#section-3.1",
                        title = "Forbidden",
                        status = 403,
                        detail = "You do not have permission to access this resource."
                    };

                    return context.Response.WriteAsync(
                        JsonSerializer.Serialize(problem));
                }
            };
        }
    }
}
