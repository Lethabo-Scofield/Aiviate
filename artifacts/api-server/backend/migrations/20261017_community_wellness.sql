CREATE TABLE IF NOT EXISTS community_posts (
    id VARCHAR PRIMARY KEY,
    company_id VARCHAR NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    parent_id VARCHAR NULL REFERENCES community_posts(id) ON DELETE CASCADE,
    author_user_id VARCHAR NOT NULL,
    author_name VARCHAR NOT NULL,
    author_role VARCHAR NOT NULL DEFAULT 'driver',
    category VARCHAR NOT NULL DEFAULT 'general',
    body TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_community_posts_company_created
    ON community_posts(company_id, created_at DESC)
    WHERE parent_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_community_posts_parent
    ON community_posts(parent_id);

CREATE TABLE IF NOT EXISTS wellness_checkins (
    id VARCHAR PRIMARY KEY,
    company_id VARCHAR NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id VARCHAR NOT NULL,
    driver_id VARCHAR NULL REFERENCES drivers(id) ON DELETE SET NULL,
    driver_name VARCHAR NULL,
    answers JSON NOT NULL DEFAULT '{}',
    risk_level VARCHAR NOT NULL DEFAULT 'low',
    reasons JSON NOT NULL DEFAULT '[]',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wellness_checkins_company_created
    ON wellness_checkins(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wellness_checkins_user_created
    ON wellness_checkins(user_id, created_at DESC);

INSERT INTO schema_migrations (version, description)
VALUES ('20261017_community_wellness', 'Driver community posts and pre-drive fatigue check-ins')
ON CONFLICT (version) DO NOTHING;
