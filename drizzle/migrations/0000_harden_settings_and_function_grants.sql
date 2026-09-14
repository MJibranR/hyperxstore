-- 1) Stop exposing the active login code to the public.
DROP POLICY IF EXISTS "settings readable by all" ON public.settings;

CREATE POLICY "admins read settings"
ON public.settings
FOR SELECT
TO authenticated
USING (public.is_admin());

REVOKE ALL ON public.settings FROM anon;
GRANT SELECT, UPDATE ON public.settings TO authenticated;
GRANT ALL ON public.settings TO service_role;

-- 2) Lock down function execution to the minimum needed.
REVOKE ALL ON FUNCTION public.claim_key(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_key(text, text) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.claim_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_admin() TO authenticated;

-- 3) Make sure anonymous visitors have no direct table access at all.
REVOKE ALL ON public.keys FROM anon;
REVOKE ALL ON public.claims FROM anon;
REVOKE ALL ON public.login_codes FROM anon;
REVOKE ALL ON public.claim_attempts FROM anon;
REVOKE ALL ON public.user_roles FROM anon;