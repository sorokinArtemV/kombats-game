FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base
USER $APP_UID
WORKDIR /app
EXPOSE 8080
EXPOSE 8081

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG BUILD_CONFIGURATION=Release
WORKDIR /src
COPY ["src/Kombats.Matchmaking/Kombats.Matchmaking.Api/Kombats.Matchmaking.Api.csproj", "src/Kombats.Matchmaking/Kombats.Matchmaking.Api/"]
COPY ["src/Kombats.Common/Kombats.Infrastructure.Messaging/Kombats.Infrastructure.Messaging.csproj", "src/Kombats.Common/Kombats.Infrastructure.Messaging/"]
COPY ["src/Kombats.Matchmaking/Kombats.Matchmaking.Application/Kombats.Matchmaking.Application.csproj", "src/Kombats.Matchmaking/Kombats.Matchmaking.Application/"]
COPY ["src/Kombats.Matchmaking/Kombats.Matchmaking.Domain/Kombats.Matchmaking.Domain.csproj", "src/Kombats.Matchmaking/Kombats.Matchmaking.Domain/"]
COPY ["src/Kombats.Matchmaking/Kombats.Matchmaking.Infrastructure/Kombats.Matchmaking.Infrastructure.csproj", "src/Kombats.Matchmaking/Kombats.Matchmaking.Infrastructure/"]
COPY ["src/Kombats.Players/Kombats.Players.Contracts/Kombats.Players.Contracts.csproj", "src/Kombats.Players/Kombats.Players.Contracts/"]
COPY ["src/Kombats.Battle/Kombats.Battle.Contracts/Kombats.Battle.Contracts.csproj", "src/Kombats.Battle/Kombats.Battle.Contracts/"]
RUN dotnet restore "src/Kombats.Matchmaking/Kombats.Matchmaking.Api/Kombats.Matchmaking.Api.csproj"
COPY . .
WORKDIR "/src/src/Kombats.Matchmaking/Kombats.Matchmaking.Api"
RUN dotnet build "./Kombats.Matchmaking.Api.csproj" -c $BUILD_CONFIGURATION -o /app/build

FROM build AS publish
ARG BUILD_CONFIGURATION=Release
RUN dotnet publish "./Kombats.Matchmaking.Api.csproj" -c $BUILD_CONFIGURATION -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "Kombats.Matchmaking.Api.dll"]
