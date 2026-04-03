FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base
USER $APP_UID
WORKDIR /app
EXPOSE 8080
EXPOSE 8081

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG BUILD_CONFIGURATION=Release
WORKDIR /src
COPY ["src/Kombats.Players/Kombats.Players.Api/Kombats.Players.Api.csproj", "src/Kombats.Players/Kombats.Players.Api/"]
COPY ["src/Kombats.Players/Kombats.Players.Application/Kombats.Players.Application.csproj", "src/Kombats.Players/Kombats.Players.Application/"]
COPY ["src/Kombats.Players/Kombats.Players.Domain/Kombats.Players.Domain.csproj", "src/Kombats.Players/Kombats.Players.Domain/"]
COPY ["src/Kombats.Players/Kombats.Players.Infrastructure/Kombats.Players.Infrastructure.csproj", "src/Kombats.Players/Kombats.Players.Infrastructure/"]
COPY ["src/Kombats.Players/Kombats.Players.Contracts/Kombats.Players.Contracts.csproj", "src/Kombats.Players/Kombats.Players.Contracts/"]
COPY ["src/Kombats.Players/Kombats.Shared/Kombats.Shared.csproj", "src/Kombats.Players/Kombats.Shared/"]
COPY ["src/Kombats.Battle/Kombats.Battle.Contracts/Kombats.Battle.Contracts.csproj", "src/Kombats.Battle/Kombats.Battle.Contracts/"]
RUN dotnet restore "src/Kombats.Players/Kombats.Players.Api/Kombats.Players.Api.csproj"
COPY . .
WORKDIR "/src/src/Kombats.Players/Kombats.Players.Api"
RUN dotnet build "./Kombats.Players.Api.csproj" -c $BUILD_CONFIGURATION -o /app/build

FROM build AS publish
ARG BUILD_CONFIGURATION=Release
RUN dotnet publish "./Kombats.Players.Api.csproj" -c $BUILD_CONFIGURATION -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "Kombats.Players.Api.dll"]
