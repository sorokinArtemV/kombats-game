# Kombats Players Service

Resource server that validates JWT access tokens issued by **Keycloak** (OIDC).

## Configuration

### appsettings.Development.json

```jsonc
{
  "Auth": {
    "Authority": "http://localhost:8080/realms/kombats",   // Keycloak realm URL
    "Audience": "kombats-backend",                          // Client ID configured in Keycloak
    "RequireHttpsMetadata": false                            // false for local dev only
  }
}
```

| Key | Description |
|-----|-------------|
| `Auth:Authority` | Keycloak realm issuer URL (`http(s)://<host>/realms/<realm>`) |
| `Auth:Audience` | The `aud` claim expected in the access token (Keycloak client ID) |
| `Auth:RequireHttpsMetadata` | Set `true` in production; `false` when running Keycloak over plain HTTP locally |

## Verifying the setup

### 1. Health check (anonymous)

```bash
curl http://localhost:5000/health
# => {"status":"healthy"}
```

### 2. Get current player info (requires Bearer token)

```bash
# Without token — expect 401
curl -i http://localhost:5000/api/me

# With a valid Keycloak access token
TOKEN=$(curl -s -X POST "http://localhost:8080/realms/kombats/protocol/openid-connect/token" \
  -d "client_id=kombats-backend" \
  -d "grant_type=password" \
  -d "username=testuser" \
  -d "password=testpass" | jq -r .access_token)

curl -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/me
# => {"playerId":"<sub UUID>","subject":"<sub>","username":"testuser","claims":[...]}
```

The `playerId` field equals the Keycloak `sub` claim (stable UUID).
