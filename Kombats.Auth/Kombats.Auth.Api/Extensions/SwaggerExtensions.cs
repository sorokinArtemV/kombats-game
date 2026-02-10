using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.OpenApi;



namespace Kombats.Auth.Api.Extensions;

public static class SwaggerExtensions
{
    public static IServiceCollection AddSwaggerDocumentation(this IServiceCollection services)
    {
        services.AddEndpointsApiExplorer();

        services.AddSwaggerGen(options =>
        {
            
            options.SwaggerDoc("v1", new OpenApiInfo
            {
                Title = "Kombats Auth Service",
                Version = "v1",
                Description = "Kombats Auth Service",
                Contact = new OpenApiContact
                {
                    Name = "Kombats Auth Team"
                }
            });
            


            // JWT Bearer
            options.AddSecurityDefinition(JwtBearerDefaults.AuthenticationScheme, new OpenApiSecurityScheme
            {
                Name = "Authorization",
                Type = SecuritySchemeType.Http,
                Scheme = JwtBearerDefaults.AuthenticationScheme,
                BearerFormat = "JWT",
                In = ParameterLocation.Header,
                Description = "Enter the JWT access token"
            });
        });

        return services;
    }

    public static IApplicationBuilder UseSwaggerDocumentation(this IApplicationBuilder app)
    {
        app.UseSwagger();

        app.UseSwaggerUI(options =>
        {
            options.SwaggerEndpoint("/swagger/v1/swagger.json", "Kombats Auth v1");
            options.RoutePrefix = "swagger";
            options.DocumentTitle = "Kombats Auth API Documentation";
        });

        return app;
    }
}