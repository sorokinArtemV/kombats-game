namespace Shared;

/// <summary>
/// Defines a handler for commands that do not return a value.
/// </summary>
/// <typeparam name="TCommand">The type of command to handle.</typeparam>
public interface ICommandHandler<in TCommand>
    where TCommand : ICommand
{
    /// <summary>
    /// Handles the specified command.
    /// </summary>
    /// <param name="command">The command to handle.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A result indicating success or failure.</returns>
    Task<Result> Handle(TCommand command, CancellationToken cancellationToken);
}

/// <summary>
/// Defines a handler for commands that return a value.
/// </summary>
/// <typeparam name="TCommand">The type of command to handle.</typeparam>
/// <typeparam name="TResponse">The type of response returned by the command.</typeparam>
public interface ICommandHandler<in TCommand, TResponse>
    where TCommand : ICommand<TResponse>
{
    /// <summary>
    /// Handles the specified command asynchronously.
    /// </summary>
    /// <param name="command">The command to handle.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>A result containing the response value or an error.</returns>
    Task<Result<TResponse>> HandleAsync(TCommand command, CancellationToken cancellationToken);
}