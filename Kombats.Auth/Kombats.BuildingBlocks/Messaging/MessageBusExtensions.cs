using Kombats.BuildingBlocks.Configuration;

namespace Kombats.BuildingBlocks.Messaging;

using MassTransit;
using MassTransit.RabbitMqTransport;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

public static class MessageBusExtensions
{
    public static IServiceCollection AddMessageBus(
        this IServiceCollection services,
        IConfiguration configuration,
        Action<IBusRegistrationConfigurator>? configureConsumers = null,
        Action<IBusRegistrationContext, IRabbitMqBusFactoryConfigurator>? configure = null)
    {
        services.ConfigureSettings<MessageBusOptions>(
            configuration,
            MessageBusOptions.SectionName);

        services.AddMassTransit(busConfig =>
        {
            configureConsumers?.Invoke(busConfig);

            busConfig.UsingRabbitMq((context, cfg) =>
            {
                MessageBusOptions options = context.GetRequiredService<IOptions<MessageBusOptions>>().Value;

                cfg.Host(options.Host, options.Port, options.VirtualHost, h =>
                {
                    h.Username(options.Username);
                    h.Password(options.Password);
                });

                cfg.UseMessageRetry(retry => retry.Interval(
                    options.RetryCount,
                    TimeSpan.FromSeconds(options.RetryIntervalSeconds)));
                
                cfg.PrefetchCount = options.PrefetchCount;
                
                cfg.UseConcurrencyLimit(options.ConcurrentMessageLimit);

                configure?.Invoke(context, cfg);

                cfg.ConfigureEndpoints(context);
            });
        });

        return services;
    }
}
