using System.Net;
using System.Net.Http.Json;
using Kombats.Bff.Application.Errors;
using Kombats.Bff.Application.Models.Internal;
using Microsoft.Extensions.Logging;

namespace Kombats.Bff.Application.Clients;

public sealed class PlayersClient(HttpClient httpClient, ILogger<PlayersClient> logger) : IPlayersClient
{
    private const string ServiceName = "Players";

    public async Task<InternalCharacterResponse?> GetCharacterAsync(CancellationToken cancellationToken = default)
    {
        return await SendAsync<InternalCharacterResponse>(
            HttpMethod.Get, "/api/v1/me", null, cancellationToken);
    }

    public async Task<InternalCharacterResponse?> EnsureCharacterAsync(CancellationToken cancellationToken = default)
    {
        return await SendAsync<InternalCharacterResponse>(
            HttpMethod.Post, "/api/v1/me/ensure", null, cancellationToken);
    }

    public async Task<InternalCharacterResponse?> SetCharacterNameAsync(
        string name, CancellationToken cancellationToken = default)
    {
        return await SendAsync<InternalCharacterResponse>(
            HttpMethod.Post, "/api/v1/character/name", new { Name = name }, cancellationToken);
    }

    public async Task<InternalCharacterResponse?> AllocateStatsAsync(
        int expectedRevision, int strength, int agility, int intuition, int vitality,
        CancellationToken cancellationToken = default)
    {
        return await SendAsync<InternalCharacterResponse>(
            HttpMethod.Post, "/api/v1/players/me/stats/allocate",
            new { Str = strength, Agi = agility, Intuition = intuition, Vit = vitality, ExpectedRevision = expectedRevision },
            cancellationToken);
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

        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }

        BffError error = await ErrorMapper.MapFromResponseAsync(response, ServiceName, cancellationToken);
        throw new BffServiceException(response.StatusCode, error);
    }
}
