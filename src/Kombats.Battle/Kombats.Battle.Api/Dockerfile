FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base
USER $APP_UID
WORKDIR /app
EXPOSE 8080
EXPOSE 8081

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG BUILD_CONFIGURATION=Release
WORKDIR /src
COPY ["src/Kombats.Battle/Kombats.Battle.Api/Kombats.Battle.Api.csproj", "src/Kombats.Battle/Kombats.Battle.Api/"]
COPY ["src/Kombats.Common/Kombats.Infrastructure.Messaging/Kombats.Infrastructure.Messaging.csproj", "src/Kombats.Common/Kombats.Infrastructure.Messaging/"]
COPY ["src/Kombats.Battle/Kombats.Battle.Application/Kombats.Battle.Application.csproj", "src/Kombats.Battle/Kombats.Battle.Application/"]
COPY ["src/Kombats.Battle/Kombats.Battle.Domain/Kombats.Battle.Domain.csproj", "src/Kombats.Battle/Kombats.Battle.Domain/"]
COPY ["src/Kombats.Battle/Kombats.Battle.Infrastructure/Kombats.Battle.Infrastructure.csproj", "src/Kombats.Battle/Kombats.Battle.Infrastructure/"]
COPY ["src/Kombats.Battle/Kombats.Battle.Contracts/Kombats.Battle.Contracts.csproj", "src/Kombats.Battle/Kombats.Battle.Contracts/"]
COPY ["src/Kombats.Battle/Kombats.Battle.Realtime.Contracts/Kombats.Battle.Realtime.Contracts.csproj", "src/Kombats.Battle/Kombats.Battle.Realtime.Contracts/"]
RUN dotnet restore "src/Kombats.Battle/Kombats.Battle.Api/Kombats.Battle.Api.csproj"
COPY . .
WORKDIR "/src/src/Kombats.Battle/Kombats.Battle.Api"
RUN dotnet build "./Kombats.Battle.Api.csproj" -c $BUILD_CONFIGURATION -o /app/build

FROM build AS publish
ARG BUILD_CONFIGURATION=Release
RUN dotnet publish "./Kombats.Battle.Api.csproj" -c $BUILD_CONFIGURATION -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "Kombats.Battle.Api.dll"]
