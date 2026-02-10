namespace Kombats.Auth.Application.Abstractions;

public interface IClock
{
   public DateTimeOffset UtcNow { get; }
}