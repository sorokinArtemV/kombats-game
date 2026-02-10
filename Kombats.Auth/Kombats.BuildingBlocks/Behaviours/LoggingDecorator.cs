using Microsoft.Extensions.Logging;
using Serilog.Context;
using Shared;

namespace Kombats.BuildingBlocks.Behaviours;

public class LoggingDecorator
{
    public sealed class CommandHandler<TCommand, TResponse>(
        ICommandHandler<TCommand, TResponse> innerHandler,
        ILogger<CommandHandler<TCommand, TResponse>> logger)
        : ICommandHandler<TCommand, TResponse>
        where TCommand : ICommand<TResponse>
    {
        public async Task<Result<TResponse>> HandleAsync(TCommand command, CancellationToken cancellationToken)
        {
            var commandName = typeof(TCommand).Name;

            logger.LogInformation("Handling command {CommandName}", commandName);

            var result = await innerHandler.HandleAsync(command, cancellationToken);

            if (result.IsSuccess)
            {
                logger.LogInformation("Successfully handled command {CommandName}. Result: {@Result}", commandName,
                    result.Value);
            }
            else
            {
                logger.LogError("Completed command {CommandName} with error", commandName);
            }

            return result;
        }
    }

    public sealed class CommandBaseHandler<TCommand>(
        ICommandHandler<TCommand> innerHandler,
        ILogger<CommandBaseHandler<TCommand>> logger)
        : ICommandHandler<TCommand>
        where TCommand : ICommand
    {
        public async Task<Result> Handle(TCommand command, CancellationToken cancellationToken)
        {
            var commandName = typeof(TCommand).Name;

            logger.LogInformation("Processing command {Command}", commandName);

            var result = await innerHandler.Handle(command, cancellationToken);

            if (result.IsSuccess)
            {
                logger.LogInformation("Completed command {Command}", commandName);
            }
            else
                using (LogContext.PushProperty("Error", result.Error, true))
                {
                    logger.LogError("Completed command {Command} with error", commandName);
                }

            return result;
        }
    }
}