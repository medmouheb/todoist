-- Who the account is for, and proof that the email address belongs to them.

ALTER TABLE users
    ADD COLUMN account_type      VARCHAR(20)  NOT NULL DEFAULT 'INDIVIDUAL'
        CHECK (account_type IN ('INDIVIDUAL', 'ORGANIZATION')),
    -- Individuals: what they'll mainly use Doable for (personal, work, study, freelance…)
    ADD COLUMN use_case          VARCHAR(30),
    -- Organizations
    ADD COLUMN organization_name VARCHAR(120),
    ADD COLUMN team_size         VARCHAR(20),
    ADD COLUMN job_title         VARCHAR(80),
    ADD COLUMN email_verified_at TIMESTAMPTZ;

-- Accounts that existed before verification was introduced count as verified.
UPDATE users SET email_verified_at = created_at;

-- Verification codes allow a few wrong guesses before they stop working.
ALTER TABLE auth_tokens ADD COLUMN attempts INT NOT NULL DEFAULT 0;
CREATE INDEX idx_auth_tokens_user_purpose ON auth_tokens (user_id, purpose, created_at DESC);
