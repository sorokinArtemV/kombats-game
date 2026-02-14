using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace Kombats.Shared.Configuration;

public static class OptionsExtensions
{
    public static OptionsBuilder<TOptions> ConfigureSettings<TOptions>(
        this IServiceCollection services,
        IConfiguration configuration,
        string sectionName) where TOptions : class
    {
        return services.AddOptions<TOptions>()
            .Bind(configuration.GetSection(sectionName))
            .ValidateDataAnnotations()
            .ValidateOnStart();
    }
}