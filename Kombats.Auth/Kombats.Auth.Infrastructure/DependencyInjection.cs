using Dapper;
using Kombats.Auth.Application.Abstractions;
using Kombats.Auth.Domain.Abstractions;
using Kombats.Auth.Infrastructure.Data;
using Kombats.Auth.Infrastructure.Data.Jwt;
using Kombats.Auth.Infrastructure.Outbox;
using Kombats.Auth.Infrastructure.Repositories;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Kombats.Auth.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        DefaultTypeMap.MatchNamesWithUnderscores = true;

        services.AddTransient<IIdentityRepository, IdentityRepository>();

        services.AddSingleton<IDbConnectionFactory, DbConnectionFactory>();
        services.AddSingleton<IPasswordHasher, PasswordHasher>();
        services.AddSingleton<IClock, Clock>();
        services.AddSingleton<ITokenService, TokenService>();
        services.AddTransient<IRefreshTokenRepository, RefreshTokenRepository>();
        services.AddTransient<IOutboxRepository, OutboxRepository>();
        services.AddTransient<ITransactionalUnitOfWork, TransactionalUnitOfWork>();

        return services;
    }
}