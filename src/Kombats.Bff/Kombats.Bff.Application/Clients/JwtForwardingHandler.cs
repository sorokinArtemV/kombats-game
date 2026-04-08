using Microsoft.AspNetCore.Http;
using Microsoft.Net.Http.Headers;

namespace Kombats.Bff.Application.Clients;

public sealed class JwtForwardingHandler(IHttpContextAccessor httpContextAccessor) : DelegatingHandler
{
    protected override Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        CancellationToken cancellationToken)
    {
        HttpContext? httpContext = httpContextAccessor.HttpContext;

        if (httpContext is not null)
        {
            string? authorization = httpContext.Request.Headers[HeaderNames.Authorization].ToString();

            if (!string.IsNullOrEmpty(authorization))
            {
                request.Headers.TryAddWithoutValidation(HeaderNames.Authorization, authorization);
            }
        }

        return base.SendAsync(request, cancellationToken);
    }
}
