-- Melhorias para o sistema de anúncios - Produção Segura

-- 1. Adicionar campos de auditoria na tabela transactions
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS type TEXT,
ADD COLUMN IF NOT EXISTS reference_id TEXT,
ADD COLUMN IF NOT EXISTS description TEXT;

-- 2. Adicionar campos para rastreamento de origem nos click_logs
ALTER TABLE click_logs
ADD COLUMN IF NOT EXISTS origin TEXT,
ADD COLUMN IF NOT EXISTS api_key TEXT;

-- 3. Adicionar campos para categoria e destaque nos anúncios
ALTER TABLE ads
ADD COLUMN IF NOT EXISTS category TEXT,
ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false;

-- 4. Criar tabela para API keys (parceiros)
CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  domain text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

-- 5. Criar tabela para logs de integração
CREATE TABLE IF NOT EXISTS integration_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key text,
  endpoint text,
  created_at timestamp with time zone DEFAULT now()
);

-- 6. Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_ads_status ON ads(status);
CREATE INDEX IF NOT EXISTS idx_ads_user_id ON ads(user_id);
CREATE INDEX IF NOT EXISTS idx_ads_created_at ON ads(created_at);
CREATE INDEX IF NOT EXISTS idx_click_logs_ad_id ON click_logs(ad_id);
CREATE INDEX IF NOT EXISTS idx_click_logs_created_at ON click_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);

-- 7. Adicionar campos para controle de orçamento diário (se não existir)
ALTER TABLE ads
ADD COLUMN IF NOT EXISTS daily_budget NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS daily_spent NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_reset DATE;

-- 8. Atualizar anúncios existentes com daily_budget
UPDATE ads
SET daily_budget = budget / 30
WHERE daily_budget = 0 OR daily_budget IS NULL;

-- 9. Função para reset diário (pode ser chamada por cron job)
CREATE OR REPLACE FUNCTION reset_daily_spending()
RETURNS void AS $$
BEGIN
  UPDATE ads
  SET daily_spent = 0, last_reset = CURRENT_DATE
  WHERE last_reset != CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;

-- 10. Trigger para atualizar last_reset automaticamente
CREATE OR REPLACE FUNCTION update_last_reset()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_reset = CURRENT_DATE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger apenas em inserções (updates manuais podem sobrescrever)
DROP TRIGGER IF EXISTS trigger_update_last_reset ON ads;
CREATE TRIGGER trigger_update_last_reset
  BEFORE INSERT ON ads
  FOR EACH ROW
  EXECUTE FUNCTION update_last_reset();

-- 11. View para métricas rápidas
CREATE OR REPLACE VIEW ad_metrics AS
SELECT
  a.id,
  a.title,
  a.user_id,
  a.clicks,
  a.views,
  CASE WHEN a.views > 0 THEN (a.clicks::float / a.views) * 100 ELSE 0 END as ctr,
  CASE WHEN a.clicks > 0 THEN a.spent / a.clicks ELSE 0 END as cpc,
  a.spent,
  a.remaining,
  a.status,
  a.created_at
FROM ads a;

-- 12. Função para calcular score de anúncio
CREATE OR REPLACE FUNCTION calculate_ad_score(ad_id uuid)
RETURNS numeric AS $$
DECLARE
  ad_record record;
  ctr numeric;
  age_hours numeric;
  novidade numeric;
  score numeric;
BEGIN
  SELECT * INTO ad_record FROM ads WHERE id = ad_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  ctr := CASE WHEN ad_record.views > 0 THEN (ad_record.clicks::numeric / ad_record.views) ELSE 0 END;
  age_hours := EXTRACT(EPOCH FROM (NOW() - ad_record.created_at)) / 3600;
  novidade := GREATEST(0, 1 - age_hours / 24);

  score := (ad_record.bid * 0.6) + (ctr * 100 * 0.3) + (novidade * 0.1);

  IF ad_record.is_featured THEN
    score := score + 10;
  END IF;

  RETURN score;
END;
$$ LANGUAGE plpgsql;

-- 13. Políticas RLS para segurança
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_logs ENABLE ROW LEVEL SECURITY;

-- Política para api_keys (apenas admins podem ver)
CREATE POLICY "api_keys_admin_only" ON api_keys
  FOR ALL USING (false); -- Temporariamente desabilitado, ajustar conforme necessidade

-- Política para integration_logs
CREATE POLICY "integration_logs_read" ON integration_logs
  FOR SELECT USING (true);

-- 14. Função para validar saldo atomicamente
CREATE OR REPLACE FUNCTION debit_balance_atomic(
  p_user_id uuid,
  p_amount numeric
) RETURNS boolean AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE users
  SET balance = balance - p_amount
  WHERE id = p_user_id AND balance >= p_amount;

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  RETURN updated_count > 0;
END;
$$ LANGUAGE plpgsql;

-- 15. Função para processar clique atomicamente
CREATE OR REPLACE FUNCTION process_ad_click(
  p_ad_id uuid,
  p_ip text,
  p_origin text DEFAULT NULL,
  p_api_key text DEFAULT NULL
) RETURNS json AS $$
DECLARE
  ad_record record;
  cost numeric;
  new_remaining numeric;
  new_spent numeric;
  new_daily_spent numeric;
  new_status text;
  result json;
BEGIN
  -- Buscar anúncio
  SELECT * INTO ad_record FROM ads WHERE id = p_ad_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Ad not found');
  END IF;

  -- Reset diário se necessário
  IF ad_record.last_reset != CURRENT_DATE THEN
    ad_record.daily_spent := 0;
    ad_record.last_reset := CURRENT_DATE;
  END IF;

  -- Verificar elegibilidade
  IF ad_record.status != 'active' OR ad_record.remaining <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Ad not eligible');
  END IF;

  cost := ad_record.bid;
  new_remaining := ad_record.remaining - cost;
  new_spent := ad_record.spent + cost;
  new_daily_spent := ad_record.daily_spent + cost;
  new_status := CASE WHEN new_remaining <= 0 THEN 'inactive' ELSE 'active' END;

  -- Verificar limite diário
  IF new_daily_spent > ad_record.daily_budget THEN
    RETURN json_build_object('success', false, 'error', 'Daily budget exceeded');
  END IF;

  -- Atualizar anúncio atomicamente
  UPDATE ads
  SET
    clicks = clicks + 1,
    spent = new_spent,
    remaining = new_remaining,
    daily_spent = new_daily_spent,
    last_reset = ad_record.last_reset,
    status = new_status
  WHERE id = p_ad_id AND remaining >= cost AND daily_spent + cost <= daily_budget;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Concurrent update detected');
  END IF;

  -- Registrar clique
  INSERT INTO click_logs (ip, ad_id, origin, api_key, created_at)
  VALUES (p_ip, p_ad_id, p_origin, p_api_key, NOW());

  -- Registrar transação
  INSERT INTO transactions (user_id, amount, type, reference_id, description)
  VALUES (ad_record.user_id, -cost, 'click', ad_record.id, 'External click: ' || ad_record.title);

  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql;