using Kombats.Shared.Configuration;
using MassTransit;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace Kombats.Shared.Messaging;

public static class MessageBusExtensions
{
    public static IServiceCollection AddMessageBus(
        this IServiceCollection services,
        IConfiguration configuration,
        Action<IBusRegistrationConfigurator>? configureConsumers = null,
        Action<IBusRegistrationContext, IRabbitMqBusFactoryConfigurator>? configure = null,
        bool autoConfigureEndpoints = true)
    {
        services.ConfigureSettings<MessageBusOptions>(configuration, MessageBusOptions.SectionName);

        services.AddMassTransit(bus =>
        {
            configureConsumers?.Invoke(bus);

            bus.UsingRabbitMq((context, cfg) =>
            {
                var options = context.GetRequiredService<IOptions<MessageBusOptions>>().Value;

                cfg.Host(options.Host, options.Port, options.VirtualHost, h =>
                {
                    h.Username(options.Username);
                    h.Password(options.Password);
                });

                cfg.UseMessageRetry(r => r.Interval(options.RetryCount, TimeSpan.FromSeconds(options.RetryIntervalSeconds)));
                cfg.PrefetchCount = options.PrefetchCount;
                cfg.UseConcurrencyLimit(options.ConcurrentMessageLimit);

                if (!string.IsNullOrWhiteSpace(options.ServiceName))
                {
                    cfg.ConfigureEndpoints(context, new KebabCaseEndpointNameFormatter(options.ServiceName, includeNamespace: false));
                }

                configure?.Invoke(context, cfg);

                if (autoConfigureEndpoints && string.IsNullOrWhiteSpace(options.ServiceName))
                {
                    cfg.ConfigureEndpoints(context);
                }
            });
        });

        return services;
    }
}
