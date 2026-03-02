using Kombats.Players.Domain.Progression;

namespace Kombats.Players.Application.Abstractions;

public interface ILevelingConfigProvider
{
   public LevelingConfig Get();
   public int GetCurrentVersion();
}

