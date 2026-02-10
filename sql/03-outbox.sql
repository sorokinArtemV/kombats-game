-- 04-outbox-status.sql
-- Outbox schema with STRING statuses + retry scheduling.
-- retry_count = attempt_count (increment on claim).
-- next_attempt_at used for retry backoff.

CREATE SCHEMA IF NOT EXISTS auth;

-- 1) Create table (fresh DB)
CREATE TABLE IF NOT EXISTS auth.outbox_messages
(
    id            UUID        NOT NULL PRIMARY KEY,
    occurred_at   TIMESTAMPTZ NOT NULL,
    type          TEXT        NOT NULL,
    payload       TEXT        NOT NULL,

    -- Processing bookkeeping
    status_text   TEXT        NOT NULL DEFAULT 'Pending',  -- Pending | Processing | Processed | Failed
    retry_count   INT         NOT NULL DEFAULT 0,          -- attempt counter
    locked_at     TIMESTAMPTZ NULL,
    next_attempt_at TIMESTAMPTZ NULL,                      -- retry scheduling
    last_error    TEXT        NULL,

    -- Audit
    processed_at  TIMESTAMPTZ NULL,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) If table already exists → add missing columns safely
ALTER TABLE auth.outbox_messages
    ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NULL;

-- 3) Indexes for worker performance

-- Fast selection of pending messages ready to process
CREATE INDEX IF NOT EXISTS idx_outbox_pending_due
    ON auth.outbox_messages (status_text, next_attempt_at, occurred_at)
    WHERE status_text = 'Pending';

-- Fast detection of stuck processing messages
CREATE INDEX IF NOT EXISTS idx_outbox_processing_locked
    ON auth.outbox_messages (status_text, locked_at)
    WHERE status_text = 'Processing';

-- Optional: ordering for batch processing
CREATE INDEX IF NOT EXISTS idx_outbox_occurred_at
    ON auth.outbox_messages (occurred_at);

-- 4) Optional: enforce allowed statuses (safe if table new)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_outbox_status_text'
    ) THEN
        ALTER TABLE auth.outbox_messages
        ADD CONSTRAINT chk_outbox_status_text
        CHECK (status_text IN ('Pending', 'Processing', 'Processed', 'Failed'));
    END IF;
END $$;
