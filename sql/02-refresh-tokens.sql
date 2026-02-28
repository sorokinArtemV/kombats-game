-- Refresh tokens table for JWT refresh token rotation
CREATE TABLE IF NOT EXISTS auth.refresh_tokens (
    id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    identity_id   uuid         NOT NULL REFERENCES auth.identities(id) ON DELETE CASCADE,
    token_hash    text         NOT NULL,
    created_at    timestamptz  NOT NULL DEFAULT now(),
    expires_at    timestamptz  NOT NULL,
    revoked_at    timestamptz  NULL,
    replaced_by_id uuid         NULL REFERENCES auth.refresh_tokens(id),
    ip            text         NULL,
    user_agent    text         NULL
);

-- Index on identity_id for quick lookups
CREATE INDEX IF NOT EXISTS ix_auth_refresh_tokens_identity_id 
ON auth.refresh_tokens(identity_id) 
WHERE revoked_at IS NULL;

-- Unique index on token_hash (for active tokens only)
CREATE UNIQUE INDEX IF NOT EXISTS ux_auth_refresh_tokens_token_hash 
ON auth.refresh_tokens(token_hash) 
WHERE revoked_at IS NULL;

-- Index on expires_at for cleanup queries
CREATE INDEX IF NOT EXISTS ix_auth_refresh_tokens_expires_at 
ON auth.refresh_tokens(expires_at);

