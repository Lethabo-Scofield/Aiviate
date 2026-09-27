CREATE TABLE IF NOT EXISTS public_tracking_tokens (
    id VARCHAR PRIMARY KEY,
    company_id VARCHAR NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    stop_id VARCHAR NOT NULL REFERENCES stops(id) ON DELETE CASCADE,
    token_hash VARCHAR NOT NULL UNIQUE,
    public_reference VARCHAR NOT NULL,
    status VARCHAR NOT NULL DEFAULT 'active',
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP NULL,
    created_by VARCHAR NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_public_tracking_tokens_company_stop
    ON public_tracking_tokens(company_id, stop_id);

CREATE INDEX IF NOT EXISTS idx_public_tracking_tokens_active
    ON public_tracking_tokens(token_hash, status, expires_at)
    WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_public_tracking_tokens_company_created
    ON public_tracking_tokens(company_id, created_at DESC);

INSERT INTO schema_migrations (version, description)
VALUES ('20260810_public_tracking', 'Secure public customer tracking tokens')
ON CONFLICT (version) DO NOTHING;
