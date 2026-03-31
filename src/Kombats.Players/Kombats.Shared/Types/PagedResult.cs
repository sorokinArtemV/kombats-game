namespace Kombats.Shared.Types;

public record PagedResult<T>
{
    public int PageNumber { get; init; }
    public int PageSize { get; init; }
    public int TotalCount { get; init; }
    public int TotalPages { get; init; }
    public List<T> Items { get; init; } = [];
}
