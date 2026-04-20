# Sistema de Anúncios SaaS - Produção

## ✅ Melhorias Implementadas

### 🔒 Segurança Financeira
- **Débito atômico**: Usa `UPDATE ... WHERE balance >= amount` para evitar race conditions
- **Validação de orçamento**: Controle rigoroso de `remaining_budget` e `daily_budget`
- **Rollback automático**: Em caso de erro, saldo é restaurado

### 🛡️ Proteções Anti-Abuso
- **Rate limiting**: 5 cliques/30s por IP (API), 1 clique/10s por IP e anúncio (anti-fraude em clique)
- **Validação de URL**: Apenas HTTP/HTTPS permitidos
- **Sanitização**: Proteção contra XSS em títulos e descrições

### 📊 Métricas Avançadas
- **CTR**: Click-through rate (cliques/visualizações)
- **CPC**: Cost per click (gasto total/cliques)
- **Ranking inteligente**: Bid (60%) + CTR (30%) + Novidade (10%) + Destaque

### 🎯 Funcionalidades
- **Filtros**: Busca por título, filtro por status
- **Planos**: FREE (até 3 anúncios), PRO (até 20), PREMIUM (ilimitado + destaque)
- **Destaque**: `is_featured` apenas no plano PREMIUM
- **Upgrade de plano**: Stripe Checkout (`createPlanCheckout`) + webhook atualiza `users.plan`
- **API pública**: Endpoints REST para integração externa
- **Script embutível**: Plug-and-play para qualquer site

### 📱 Responsividade
- **Mobile-first**: CSS otimizado para dispositivos móveis
- **Touch-friendly**: Botões e inputs adequados para toque
- **Performance**: Carregamento otimizado

## 🚀 Deploy

### 1. Variáveis de Ambiente
```bash
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
JWT_SECRET=your_jwt_secret
STRIPE_SECRET_KEY=your_stripe_key
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_PLAN_BRL=29.90
STRIPE_PREMIUM_PLAN_BRL=79.90
RESEND_API_KEY=your_resend_key
BASE_URL=https://yourdomain.com
API_KEYS_REQUIRED=false  # true para exigir API keys
```

No Stripe Dashboard, configure o webhook **POST** para `https://SEU_DOMINIO/api/stripeWebhook` com o evento `checkout.session.completed`.

### 2. Executar SQL (ordem)
```bash
psql "$DATABASE_URL" -f database/improvements.sql
psql "$DATABASE_URL" -f database/production_close.sql
```

O arquivo `database/production_close.sql` aplica: `search_path` seguro nas funções, políticas RLS (sem `USING (true)` em logs), tabela `errors`, alias `update_ad_score` e bloqueio de cliente direto em `click_logs` / `errors`.

### 3. Deploy
```bash
npm install
npm run build
# Deploy no Vercel/Netlify/etc
```

## 📋 API Endpoints

### Privados (requerem JWT)
- `POST /api?action=createAd` - Criar anúncio
- `GET /api?action=myAds&status=active&search=termo` - Listar anúncios
- `POST /api?action=toggleAd` - Alterar status/destaque
- `GET /api?action=dashboard` - Métricas do usuário
- `GET /api?action=transactions` - Histórico financeiro

### Públicos (Ad Network)
- `GET /api/ads?limit=5&category=tech` - Listar anúncios ativos
- `POST /api/click` - Registrar clique
- `GET /api/v1/ads` - Versão versionada
- `POST /api/v1/click` - Versão versionada

### Autenticação
- `POST /api?action=register` - Registrar usuário
- `POST /api?action=login` - Fazer login
- `POST /api?action=createCheckout` - Criar pagamento Stripe (saldo)
- `POST /api?action=createPlanCheckout` - Checkout upgrade de plano (`body: { "plan": "pro" | "premium" }`)

## 🎨 Script Embutível

```html
<div id="ads"></div>
<script src="https://yourdomain.com/ads.js"></script>
```

## 🔧 Manutenção

### Reset Diário
Configure um cron job para executar:
```sql
SELECT reset_daily_spending();
```

### Monitoramento
- Logs em `integration_logs` para uso da API
- Transações em `transactions` para auditoria financeira
- Erros em `errors` para debugging

### Backup
- Backup diário das tabelas críticas
- Monitorar uso de API keys

## 📈 Escalabilidade

### Otimizações
- Índices criados para queries frequentes
- Cache de dashboard (5min)
- Views para métricas rápidas

### Limites
- Rate limiting por IP
- Limites por plano de usuário
- Controle de orçamento diário

## 🔐 Segurança

- **CORS**: Configurado para domínios externos
- **Headers**: Security headers aplicados
- **Validação**: Input sanitization em todas as entradas
- **Autenticação**: JWT com expiração
- **Autorização**: Controle de permissões por usuário

## 🧪 Testes

### Testar API
```bash
# Criar anúncio
curl -X POST /api?action=createAd \
  -H "Authorization: Bearer YOUR_JWT" \
  -d '{"title":"Test","description":"Test ad","link":"https://example.com","bid":1,"budget":10}'

# Listar anúncios públicos
curl /api/ads?limit=3

# Simular clique
curl -X POST /api/click \
  -d '{"adId":"ad-uuid"}'
```

### Testar Script
```html
<!DOCTYPE html>
<html>
<body>
  <div id="ads"></div>
  <script src="http://localhost:3000/ads.js"></script>
</body>
</html>
```

## 📞 Suporte

Para issues ou melhorias, verificar:
1. Logs de erro no Supabase
2. Métricas de performance
3. Rate limiting ativo
4. Saldo dos usuários

## 🎯 Roadmap

- [ ] Integração PIX (Mercado Pago/Asaas)
- [ ] Dashboard admin
- [ ] Relatórios avançados
- [ ] API webhooks
- [ ] Multi-idioma