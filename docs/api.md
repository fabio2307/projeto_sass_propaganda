# API de Anúncios (Ad Network)

## Endpoints

### GET /api/ads?limit=5&category=tech
### GET /api/v1/ads?limit=5&category=tech

Parâmetros:
- `limit` (opcional): número máximo de anúncios retornados. Padrão: `5`.
- `category` (opcional): filtra anúncios pela categoria. Se não houver correspondência, retorna fallback de anúncios ativos.

Resposta:
```json
[
  {
    "id": "uuid",
    "title": "string",
    "description": "string",
    "link": "string",
    "bid": 1
  }
]
```

### POST /api/click
### POST /api/v1/click

Body:
```json
{
  "adId": "uuid",
  "referrer": "https://origem.com"
}
```

Headers:
- `Content-Type: application/json`
- `Authorization: Bearer API_KEY` (opcional, se `API_KEYS_REQUIRED=true`)

Resposta de sucesso:
```json
{ "success": true }
```

Resposta de erro exemplo:
```json
{ "error": "Ad not found" }
```

## Autenticação

Se `API_KEYS_REQUIRED=true` estiver ativado, todas as requisições à API pública exigirão um cabeçalho:

```http
Authorization: Bearer SUA_CHAVE_API
```

## Script embutível

Use assim:

```html
<div id="ads"></div>
<script src="https://SEU_DOMINIO/ads.js"></script>
```

O script detecta automaticamente o container `#ads` ou o elemento pai do `<script>`.

## SQL sugerido

```sql
CREATE TABLE api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  domain text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE integration_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key text,
  endpoint text,
  created_at timestamp with time zone DEFAULT now()
);
```

## Observações

- O endpoint `/api/ads` mantém compatibilidade com o frontend atual.
- `/api/v1/ads` e `/api/v1/click` são versões REST versionadas.
- O script público envia `document.referrer` para rastrear a origem do clique.
- O CORS está habilitado para `GET`, `POST` e `OPTIONS`.
