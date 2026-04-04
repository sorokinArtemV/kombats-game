namespace Kombats.Players.Application.Abstractions;

public sealed class ConcurrencyConflictException : Exception
{
    public ConcurrencyConflictException(Exception innerException)
        : base("A concurrency conflict occurred.", innerException)
    {
    }
}
