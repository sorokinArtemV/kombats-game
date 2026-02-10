using Npgsql;

namespace Kombats.Auth.Infrastructure.Data;

public interface IDbConnectionFactory
{
   public Task<NpgsqlConnection> CreateOpenConnectionAsync(CancellationToken cancellationToken = default);
}

