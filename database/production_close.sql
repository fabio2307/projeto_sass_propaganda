-- =============================================================================
-- Ads SaaS — fechamento de produção: search_path seguro, RLS, funções, tabelas
-- Execute no Supabase SQL Editor DEPOIS de database/improvements.sql (se já
-- aplicado). Idempotente onde possível (IF EXISTS / IF NOT EXISTS).
-- =============================================================================
-- NOTA: A API usa service_role e ignora RLS. As políticas protegem acesso
-- direto (PostgREST anon/authenticated). Com login JWT custom na tabela
-- public.users, auth.uid() só casa se id = auth.users.id (migrar para Auth).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Tabela de erros da API (opcional, usada pelo handler Node)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message text,
  stack text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.errors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "errors_no_client_access" ON public.errors;
CREATE POLICY "errors_no_client_access"
  ON public.errors
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

-- ---------------------------------------------------------------------------
-- 2) Remover política permissiva antiga em integration_logs
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "integration_logs_read" ON public.integration_logs;

DROP POLICY IF EXISTS "integration_logs_no_client" ON public.integration_logs;
CREATE POLICY "integration_logs_no_client"
  ON public.integration_logs
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

-- api_keys: manter bloqueado para clientes
DROP POLICY IF EXISTS "api_keys_admin_only" ON public.api_keys;
CREATE POLICY "api_keys_no_client"
  ON public.api_keys
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

-- ---------------------------------------------------------------------------
-- 3) RLS em tabelas principais (acesso direto ao PostgREST)
-- ---------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.click_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own" ON public.users;
DROP POLICY IF EXISTS "users_update_own" ON public.users;

CREATE POLICY "users_select_own"
  ON public.users FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "users_update_own"
  ON public.users FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "ads_select_public_active" ON public.ads;
DROP POLICY IF EXISTS "ads_select_own" ON public.ads;
DROP POLICY IF EXISTS "ads_insert_own" ON public.ads;
DROP POLICY IF EXISTS "ads_update_own" ON public.ads;
DROP POLICY IF EXISTS "ads_delete_own" ON public.ads;

-- Leitura pública: apenas anúncios ativos (listagem na vitrine)
CREATE POLICY "ads_select_public_active"
  ON public.ads FOR SELECT TO anon, authenticated
  USING (status = 'active');

-- Dono vê todos os seus (incl. pausados)
CREATE POLICY "ads_select_own"
  ON public.ads FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "ads_insert_own"
  ON public.ads FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "ads_update_own"
  ON public.ads FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "ads_delete_own"
  ON public.ads FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "transactions_select_own" ON public.transactions;
DROP POLICY IF EXISTS "transactions_insert_own" ON public.transactions;

CREATE POLICY "transactions_select_own"
  ON public.transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "transactions_insert_own"
  ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- click_logs: sem user_id — apenas backend (service_role) deve escrever
DROP POLICY IF EXISTS "click_logs_no_client" ON public.click_logs;
CREATE POLICY "click_logs_no_client"
  ON public.click_logs
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

-- ad_clicks (se existir)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ad_clicks'
  ) THEN
    EXECUTE 'ALTER TABLE public.ad_clicks ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "ad_clicks_no_client" ON public.ad_clicks';
    EXECUTE $p$
      CREATE POLICY "ad_clicks_no_client"
        ON public.ad_clicks
        FOR ALL
        TO authenticated, anon
        USING (false)
        WITH CHECK (false)
    $p$;
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 4) Funções com search_path fixo e nomes de schema explícitos
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reset_daily_spending()
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public.ads
  SET daily_spent = 0, last_reset = CURRENT_DATE
  WHERE last_reset IS DISTINCT FROM CURRENT_DATE;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_last_reset()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.last_reset := CURRENT_DATE;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_last_reset ON public.ads;
CREATE TRIGGER trigger_update_last_reset
  BEFORE INSERT ON public.ads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_last_reset();

CREATE OR REPLACE FUNCTION public.calculate_ad_score(ad_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  ad_record public.ads%ROWTYPE;
  ctr numeric;
  age_hours numeric;
  novidade numeric;
  score numeric;
BEGIN
  SELECT * INTO ad_record FROM public.ads WHERE public.ads.id = ad_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  ctr := CASE WHEN ad_record.views > 0
    THEN (ad_record.clicks::numeric / NULLIF(ad_record.views, 0))
    ELSE 0 END;

  age_hours := EXTRACT(EPOCH FROM (now() - ad_record.created_at)) / 3600.0;
  novidade := GREATEST(0::numeric, 1::numeric - (age_hours / 24.0));

  score :=
    (COALESCE(ad_record.bid, 0) * 0.6) +
    (ctr * 100.0 * 0.3) +
    (novidade * 0.1);

  IF COALESCE(ad_record.is_featured, false) THEN
    score := score + 10;
  END IF;

  RETURN score;
END;
$$;

-- Alias pedido no roteiro (mesmo cálculo)
CREATE OR REPLACE FUNCTION public.update_ad_score(ad_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT public.calculate_ad_score(ad_id);
$$;

CREATE OR REPLACE FUNCTION public.debit_balance_atomic(p_user_id uuid, p_amount numeric)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE public.users
  SET balance = balance - p_amount
  WHERE id = p_user_id AND balance >= p_amount;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_ad_click(
  p_ad_id uuid,
  p_ip text,
  p_origin text DEFAULT NULL,
  p_api_key text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  ad_record public.ads%ROWTYPE;
  cost numeric;
  new_remaining numeric;
  new_spent numeric;
  new_daily_spent numeric;
  new_status text;
BEGIN
  SELECT * INTO ad_record FROM public.ads WHERE public.ads.id = p_ad_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Ad not found');
  END IF;

  IF ad_record.last_reset IS DISTINCT FROM CURRENT_DATE THEN
    ad_record.daily_spent := 0;
    ad_record.last_reset := CURRENT_DATE;
  END IF;

  IF ad_record.status <> 'active' OR COALESCE(ad_record.remaining, 0) <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Ad not eligible');
  END IF;

  cost := ad_record.bid;
  new_remaining := ad_record.remaining - cost;
  new_spent := ad_record.spent + cost;
  new_daily_spent := ad_record.daily_spent + cost;
  new_status := CASE WHEN new_remaining <= 0 THEN 'inactive' ELSE 'active' END;

  IF new_daily_spent > ad_record.daily_budget THEN
    RETURN json_build_object('success', false, 'error', 'Daily budget exceeded');
  END IF;

  UPDATE public.ads
  SET
    clicks = public.ads.clicks + 1,
    spent = new_spent,
    remaining = new_remaining,
    daily_spent = new_daily_spent,
    last_reset = ad_record.last_reset,
    status = new_status
  WHERE public.ads.id = p_ad_id
    AND public.ads.remaining >= cost
    AND public.ads.daily_spent + cost <= public.ads.daily_budget;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Concurrent update detected');
  END IF;

  INSERT INTO public.click_logs (ip, ad_id, origin, api_key, created_at)
  VALUES (p_ip, p_ad_id, p_origin, p_api_key, now());

  INSERT INTO public.transactions (user_id, amount, type, reference_id, description)
  VALUES (
    ad_record.user_id,
    -cost,
    'click',
    ad_record.id,
    'External click: ' || ad_record.title
  );

  RETURN json_build_object('success', true);
END;
$$;

-- Opcional: coluna materializada para ordenação por score no SQL
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS score_cached numeric;

COMMENT ON COLUMN public.ads.score_cached IS 'Preencher via job ou trigger; listagem pode ordenar por isto.';
