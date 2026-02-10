CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.identities (
    id            uuid         PRIMARY KEY,
    email         text         NOT NULL,
    password_hash text         NOT NULL,
    status        smallint     NOT NULL,
    version       integer      NOT NULL DEFAULT 0,
    created       timestamptz  NOT NULL DEFAULT now(),
    updated       timestamptz  NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness for email (optional but usually correct for auth)
CREATE UNIQUE INDEX IF NOT EXISTS ux_auth_identities_email_ci
ON auth.identities (lower(email));

-- Keep updated timestamp fresh on UPDATE
CREATE OR REPLACE FUNCTION auth.set_updated_timestamp()
RETURNS trigger AS $$
BEGIN
    NEW.updated = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auth_identities_set_updated ON auth.identities;

CREATE TRIGGER trg_auth_identities_set_updated
BEFORE UPDATE ON auth.identities
FOR EACH ROW
EXECUTE FUNCTION auth.set_updated_timestamp();