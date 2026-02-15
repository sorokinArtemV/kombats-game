using System.Reflection;
using FluentValidation;
using Kombats.Players.Api.Validators;


namespace Kombats.Players.Api.Extensions;

/// <summary>
/// Extension methods for registering FluentValidation.
/// </summary>
public static class ValidationExtensions
{
    /// <summary>
    /// Registers FluentValidation validators from the specified assembly and the validation endpoint filter.
    /// </summary>
    public static IServiceCollection AddValidation(this IServiceCollection services, Assembly assembly)
    {
        // Register all validators from the assembly
        services.AddValidatorsFromAssembly(assembly);
        
        services.AddValidatorsFromAssemblyContaining<AllocateStatPointsRequestValidator>();

        return services;
    }
}

