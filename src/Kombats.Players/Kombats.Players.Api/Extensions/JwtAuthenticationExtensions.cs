using System.Text.Json;
using Kombats.Players.Api.Auth;
using Kombats.Shared.Configuration;
using Microsoft.AspNetCore.Authentication.JwtBearer;
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
}
