namespace Kombats.Auth.Domain.ValueObjects;

public sealed class Email
{
    private Email(string value)
    {
        Value = value;
    }

    public string Value { get; }

    public static Email Create(string email)
    {
        if (string.IsNullOrWhiteSpace(email))
            throw new ArgumentException("Email cannot be null or empty.", nameof(email));

        var normalized = email.Trim().ToLowerInvariant();

        if (normalized.Length < 3)
            throw new ArgumentException("Email must be at least 3 characters long.", nameof(email));

        return !normalized.Contains('@')
            ? throw new ArgumentException("Email must contain '@' symbol.", nameof(email))
            : new Email(normalized);
    }

    public override bool Equals(object? obj)
    {
        return obj is Email other && Value == other.Value;
    }

    public override int GetHashCode()
    {
        return Value.GetHashCode();
    }

    public override string ToString()
    {
        return Value;
    }
}