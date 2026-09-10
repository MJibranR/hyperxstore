-- ROLES
CREATE TYPE public.app_role AS ENUM ('admin');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own roles readable" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin');
$$;

-- first signed-in user may claim admin if no admin exists yet
CREATE OR REPLACE FUNCTION public.claim_admin()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    RETURN public.has_role(v_uid, 'admin');
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN true;
END;
$$;

-- LOGIN CODES
CREATE TABLE public.login_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.login_codes TO authenticated;
GRANT ALL ON public.login_codes TO service_role;
ALTER TABLE public.login_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage login codes" ON public.login_codes FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- SETTINGS
CREATE TABLE public.settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  current_login_code text,
  discord_invite_url text NOT NULL DEFAULT 'https://discord.gg/yourinvite',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.settings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.settings TO authenticated;
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings readable by all" ON public.settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admins update settings" ON public.settings FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- KEYS
CREATE TABLE public.keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_value text NOT NULL UNIQUE,
  login_code text NOT NULL REFERENCES public.login_codes(code) ON UPDATE CASCADE,
  status text NOT NULL DEFAULT 'available',
  expires_at timestamptz,
  claimed_by_hwid text,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT keys_status_check CHECK (status IN ('available','claimed','expired','revoked'))
);
CREATE INDEX keys_batch_status_idx ON public.keys (login_code, status, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.keys TO authenticated;
GRANT ALL ON public.keys TO service_role;
ALTER TABLE public.keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage keys" ON public.keys FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- CLAIMS
CREATE TABLE public.claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hwid text NOT NULL,
  key_id uuid NOT NULL REFERENCES public.keys(id) ON DELETE CASCADE,
  login_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hwid, login_code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.claims TO authenticated;
GRANT ALL ON public.claims TO service_role;
ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage claims" ON public.claims FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- RATE LIMIT LOG
CREATE TABLE public.claim_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hwid text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX claim_attempts_hwid_idx ON public.claim_attempts (hwid, created_at DESC);
GRANT ALL ON public.claim_attempts TO service_role;
ALTER TABLE public.claim_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read attempts" ON public.claim_attempts FOR SELECT TO authenticated USING (public.is_admin());

-- CORE CLAIM FUNCTION
CREATE OR REPLACE FUNCTION public.claim_key(p_login_code text, p_hwid text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_current text;
  v_key public.keys;
  v_attempts int;
  v_discord text;
BEGIN
  IF p_hwid IS NULL OR length(p_hwid) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_hwid');
  END IF;

  SELECT count(*) INTO v_attempts FROM public.claim_attempts
    WHERE hwid = p_hwid AND created_at > now() - interval '1 minute';
  IF v_attempts >= 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limited');
  END IF;
  INSERT INTO public.claim_attempts (hwid) VALUES (p_hwid);
  DELETE FROM public.claim_attempts WHERE created_at < now() - interval '1 day';

  SELECT current_login_code, discord_invite_url INTO v_current, v_discord
    FROM public.settings ORDER BY updated_at DESC LIMIT 1;

  IF v_current IS NULL OR p_login_code IS NULL OR btrim(p_login_code) <> v_current THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;

  SELECT k.* INTO v_key FROM public.claims c JOIN public.keys k ON k.id = c.key_id
    WHERE c.hwid = p_hwid AND c.login_code = v_current LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'key_value', v_key.key_value,
      'expires_at', v_key.expires_at,
      'status', CASE WHEN v_key.status = 'revoked' THEN 'revoked'
                     WHEN v_key.expires_at IS NOT NULL AND v_key.expires_at <= now() THEN 'expired'
                     ELSE 'claimed' END,
      'discord_invite_url', v_discord,
      'reused', true
    );
  END IF;

  SELECT * INTO v_key FROM public.keys
    WHERE login_code = v_current AND status = 'available'
      AND (expires_at IS NULL OR expires_at > now())
    ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_keys');
  END IF;

  UPDATE public.keys SET status = 'claimed', claimed_by_hwid = p_hwid, claimed_at = now()
    WHERE id = v_key.id;
  INSERT INTO public.claims (hwid, key_id, login_code) VALUES (p_hwid, v_key.id, v_current);

  RETURN jsonb_build_object(
    'ok', true,
    'key_value', v_key.key_value,
    'expires_at', v_key.expires_at,
    'status', 'claimed',
    'discord_invite_url', v_discord,
    'reused', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_key(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_key(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_admin() TO authenticated;

-- SEED
INSERT INTO public.login_codes (code, is_active) VALUES ('Hypeee1973', true);
INSERT INTO public.settings (current_login_code, discord_invite_url)
  VALUES ('Hypeee1973', 'https://discord.gg/yourinvite');
INSERT INTO public.keys (key_value, login_code, expires_at) VALUES
  ('HYPE-TEST-0001-AAAA', 'Hypeee1973', now() + interval '30 days'),
  ('HYPE-TEST-0002-BBBB', 'Hypeee1973', now() + interval '30 days'),
  ('HYPE-TEST-0003-CCCC', 'Hypeee1973', now() + interval '60 days'),
  ('HYPE-TEST-0004-DDDD', 'Hypeee1973', NULL),
  ('HYPE-TEST-0005-EEEE', 'Hypeee1973', now() - interval '1 day');