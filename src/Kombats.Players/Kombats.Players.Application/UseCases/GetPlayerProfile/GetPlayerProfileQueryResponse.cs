using Kombats.Players.Domain.Entities;

namespace Kombats.Players.Application.UseCases.GetPlayerProfile;

public sealed record GetPlayerProfileQueryResponse(
    Guid PlayerId,
    string? DisplayName,
    int Level,
    int Strength,
    int Agility,
    int Intuition,
    int Vitality,
    int Wins,
    int Losses,
    OnboardingState OnboardingState);
