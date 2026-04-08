using System.Net;
using System.Net.Http.Json;
using Kombats.Bff.Application.Errors;
using Kombats.Bff.Application.Models.Internal;
using Microsoft.Extensions.Logging;

namespace Kombats.Bff.Application.Clients;

public sealed class MatchmakingClient(HttpClient httpClient, ILogger<MatchmakingClient> logger) : IMatchmakingClient
{
    private const string ServiceName = "Matchmaking";

    public async Task<InternalQueueStatusResponse> JoinQueueAsync(CancellationToken cancellationToken = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/matchmaking/queue/join");
        request.Content = JsonContent.Create(new { Variant = (string?)null });

        HttpResponseMessage response;
        try
        {
            response = await httpClient.SendAsync(request, cancellationToken);
        }
        catch (HttpRequestException ex)
        {
            logger.LogError(ex, "Failed to reach {Service} at {Path}", ServiceName, "/api/v1/matchmaking/queue/join");
            throw new ServiceUnavailableException(ServiceName);
        }

        // 200 = joined queue (Searching), 409 = already matched (returns QueueStatusDto with match info)
        if (response.IsSuccessStatusCode || response.StatusCode == System.Net.HttpStatusCode.Conflict)
        {
            var result = await response.Content.ReadFromJsonAsync<InternalQueueStatusResponse>(cancellationToken);
            return result ?? new InternalQueueStatusResponse("Searching");
        }

        BffError error = await ErrorMapper.MapFromResponseAsync(response, ServiceName, cancellationToken);
        throw new BffServiceException(response.StatusCode, error);
    }

    public async Task<InternalLeaveQueueResponse> LeaveQueueAsync(CancellationToken cancellationToken = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/matchmaking/queue/leave");
        request.Content = JsonContent.Create(new { Variant = (string?)null });

        HttpResponseMessage response;
        try
        {
            response = await httpClient.SendAsync(request, cancellationToken);
        }
        catch (HttpRequestException ex)
        {
            logger.LogError(ex, "Failed to reach {Service} at {Path}", ServiceName, "/api/v1/matchmaking/queue/leave");
            throw new ServiceUnavailableException(ServiceName);
        }

        // Both 200 (left queue) and 409 (already matched) are valid outcomes
        if (response.IsSuccessStatusCode || response.StatusCode == System.Net.HttpStatusCode.Conflict)
        {
            var result = await response.Content.ReadFromJsonAsync<InternalLeaveQueueResponse>(cancellationToken);
            return result ?? new InternalLeaveQueueResponse(false);
        }

        BffError error = await ErrorMapper.MapFromResponseAsync(response, ServiceName, cancellationToken);
        throw new BffServiceException(response.StatusCode, error);
    }

    public async Task<InternalQueueStatusResponse?> GetQueueStatusAsync(CancellationToken cancellationToken = default)
    {
        return await SendAsync<InternalQueueStatusResponse>(
            HttpMethod.Get, "/api/v1/matchmaking/queue/status", null, cancellationToken);
    }

    private async Task<T?> SendAsync<T>(
        HttpMethod method, string path, object? body, CancellationToken cancellationToken) where T : class
    {
        using var request = new HttpRequestMessage(method, path);

        if (body is not null)
        {
            request.Content = JsonContent.Create(body);
        }

        HttpResponseMessage response;
        try
        {
            response = await httpClient.SendAsync(request, cancellationToken);
        }
        catch (HttpRequestException ex)
        {
            logger.LogError(ex, "Failed to reach {Service} at {Path}", ServiceName, path);
            throw new ServiceUnavailableException(ServiceName);
        }

        if (response.IsSuccessStatusCode)
        {
            return await response.Content.ReadFromJsonAsync<T>(cancellationToken);
        }

        BffError error = await ErrorMapper.MapFromResponseAsync(response, ServiceName, cancellationToken);
        throw new BffServiceException(response.StatusCode, error);
    }
}
