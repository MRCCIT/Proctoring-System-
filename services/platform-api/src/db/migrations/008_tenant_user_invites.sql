-- Tenant admin invite / set-password / forgot-password tokens

ALTER TABLE tenant_users
  ALTER COLUMN password_hash DROP NOT NULL;

ALTER TABLE tenant_users
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE tenant_users
  DROP CONSTRAINT IF EXISTS tenant_users_status_check;

ALTER TABLE tenant_users
  ADD CONSTRAINT tenant_users_status_check
  CHECK (status IN ('pending', 'active'));

ALTER TABLE tenant_users
  ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ;

ALTER TABLE tenant_users
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;

-- Existing users already have passwords — treat as activated
UPDATE tenant_users
   SET status = 'active',
       activated_at = COALESCE(activated_at, created_at)
 WHERE password_hash IS NOT NULL
   AND activated_at IS NULL;

CREATE TABLE IF NOT EXISTS tenant_auth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES tenant_users (id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('invite', 'reset')),
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_tenant_auth_tokens_user
  ON tenant_auth_tokens (user_id, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_auth_tokens_expires
  ON tenant_auth_tokens (expires_at)
  WHERE used_at IS NULL;
