# Respondera

Extensão Chrome que gera respostas profissionais para avaliações do Google Perfil de Empresas usando IA (Claude Haiku).

## Pré-requisitos

- [Node.js](https://nodejs.org/) v20+
- [pnpm](https://pnpm.io/) v9+ (`npm install -g pnpm`)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (para o PostgreSQL)
- Google Chrome

---

## 1. Banco de dados (PostgreSQL via Docker)

```bash
docker run -d \
  --name respondera \
  -e POSTGRES_USER=respondera \
  -e POSTGRES_PASSWORD=respondera \
  -e POSTGRES_DB=respondera \
  -p 5432:5432 \
  postgres:16
```

> Se o container já existe: `docker start respondera`

---

## 2. Backend

### Instalação

```bash
cd backend
pnpm install
```

### Variáveis de ambiente

Copie `.env.example` para `.env` e preencha:

```bash
cp .env.example .env
```

```env
DATABASE_URL="postgresql://respondera:respondera@localhost:5432/respondera"
JWT_SECRET="string-longa-e-aleatoria-aqui"
ANTHROPIC_API_KEY="sk-ant-..."
PORT=3333
CORS_ORIGIN="*"
```

### Migrations

```bash
pnpm prisma:migrate
```

### Rodar em desenvolvimento

```bash
pnpm dev
```

O backend sobe na porta **3333**. Confirme com:
```
GET http://localhost:3333/health
```

---

## 3. Extensão Chrome

### Instalação

```bash
cd extension
pnpm install
```

### Build para desenvolvimento (aponta para localhost:3333)

```bash
pnpm build:dev
```

> Use `pnpm dev` para recompilar automaticamente ao salvar.  
> Use `pnpm build` apenas para produção (aponta para `https://api.respondera.com.br`).

### Carregar no Chrome

1. Abra `chrome://extensions`
2. Ative o **Modo do desenvolvedor** (canto superior direito)
3. Clique em **"Carregar sem compactação"**
4. Selecione a pasta `extension/dist/`
5. Nos **Detalhes** da extensão, ative **"Permitir acesso a URLs de arquivo"**

> Sempre que recompilar, clique em **↺ Atualizar** na extensão (ou remova e adicione novamente se o `manifest.json` mudou).

### Testar com o mock local

Abra o arquivo `extension/mock/mock-reviews.html` diretamente no Chrome (`Ctrl+O`).

Alternativamente, sirva via HTTP (evita restrições de `file://`):

```bash
pnpm mock   # sobe em http://localhost:8080
```

Para que o content script injete no mock via HTTP, adicione temporariamente `http://localhost:8080/*` às `matches` em `manifest.json` e recompile.

---

## 4. Fluxo de teste completo

### a. Criar conta
1. Clique no ícone da Respondera na barra do Chrome
2. Clique em **"Criar conta"** → preencha email e senha → **"Criar conta"**

### b. Verificar injeção do botão
1. Abra o mock (`mock-reviews.html`) no Chrome
2. Cada avaliação deve exibir o botão **"✨ Responder com IA"**

### c. Gerar resposta
1. Clique no botão de uma avaliação → painel abre à direita
2. Selecione o tom desejado (Amigável / Formal / Empático)
3. Clique **"Gerar resposta"**
4. Aguarde a resposta aparecer no textarea

### d. Usar resposta
1. Edite o texto se necessário
2. Clique **"✓ Usar esta resposta"**
3. O texto é inserido no campo da avaliação e o painel fecha

### e. Testar limite (plano FREE)
- O plano FREE permite **10 respostas por mês**
- Na 11ª tentativa o painel mostra: "Você atingiu o limite de respostas deste mês"

---

## 5. Estrutura do projeto

```
respondera/
├── backend/                  # API Node.js + Express
│   ├── src/
│   │   ├── index.ts          # Entrada Express
│   │   ├── routes/           # auth, business, reply
│   │   ├── middlewares/      # authMiddleware, usageLimitMiddleware
│   │   ├── services/         # anthropicService, usageService
│   │   └── prisma/           # schema.prisma + migrations
│   ├── .env                  # NÃO versionado
│   └── .env.example
│
└── extension/                # Extensão Chrome (Manifest V3)
    ├── src/
    │   ├── content.ts        # Injetado nas páginas — detecta cards e injecta botão
    │   ├── background.ts     # Service worker — chama API e responde ao painel
    │   ├── panel/            # Painel lateral (iframe overlay)
    │   │   ├── panel.ts
    │   │   ├── panel.html
    │   │   └── panel.css
    │   ├── popup/            # Popup do ícone da extensão
    │   │   ├── popup.ts
    │   │   ├── popup.html
    │   │   └── popup.css
    │   └── shared/
    │       ├── api.ts        # Camada de comunicação com o backend
    │       ├── storage.ts    # Wrapper tipado para chrome.storage.local
    │       └── types.ts      # Tipos compartilhados
    ├── mock/
    │   └── mock-reviews.html # Página de teste local
    ├── manifest.json
    └── webpack.config.js
```

---

## 6. Scripts disponíveis

### Backend (`cd backend`)

| Script | Descrição |
|---|---|
| `pnpm dev` | Servidor em modo watch (tsx) |
| `pnpm build` | Compila TypeScript |
| `pnpm start` | Roda build de produção |
| `pnpm prisma:migrate` | Cria e aplica migrations |
| `pnpm prisma:migrate:deploy` | Aplica migrations (produção) |
| `pnpm prisma:studio` | Abre Prisma Studio |

### Extensão (`cd extension`)

| Script | Descrição |
|---|---|
| `pnpm dev` | Build em watch (localhost:3333) |
| `pnpm build:dev` | Build único para desenvolvimento |
| `pnpm build` | Build de produção (api.respondera.com.br) |
| `pnpm mock` | Serve o mock em http://localhost:8080 |

---

## 7. Variáveis de ambiente do backend

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | ✅ | Connection string PostgreSQL |
| `JWT_SECRET` | ✅ | Secret para assinar tokens JWT |
| `ANTHROPIC_API_KEY` | ✅ | Chave da API Anthropic |
| `PORT` | ❌ | Porta do servidor (padrão: 3333) |
| `CORS_ORIGIN` | ❌ | Origem permitida no CORS (padrão: `*`) |

---

## 8. Planos

| Plano | Respostas/mês |
|---|---|
| FREE | 10 |
| PRO | 200 |

O contador reseta no início de cada mês.

---

## 9. Segurança

### Validação de entrada

- Todos os endpoints validam entrada com **Zod** antes de processar
- Tamanho máximo de `reviewText`: 2000 caracteres
- Tamanho máximo de `additionalContext`: 300 caracteres
- Senhas mínimo 6 caracteres (em produção, aumentar para 12+)

### Rate limiting

- **Login/Registro**: 10 requisições por IP por 15 minutos
- **Geração de resposta**: 30 requisições por usuário por hora

### Sanitização

- HTML tags removidas de inputs (especialmente `reviewText` e `additionalContext`)
- Email validado conforme RFC 5321
- Senhas comparadas com tempo-constante (bcrypt)

### Logging e auditoria

- Senhas **nunca** são logadas (descartadas após hash)
- Tokens JWT **nunca** são logadas
- Logs estruturados com Winston incluem:
  - Falhas de autenticação (email mascarado: primeiros 3 chars + `***`)
  - Erros de geração de IA (mensagem truncada a 200 chars, sem tokens)
  - Acesso autorizado (userId mascarado: primeiros 8 chars)
- Todos os logs em **JSON** para facilitar monitoramento

### Middleware de segurança

- **Helmet.js**: Headers HTTP de segurança
- **CORS**: Configurável via `CORS_ORIGIN`
- **Limite de payload**: Máximo 10KB por requisição
- **Erro handler global**: Expõe apenas mensagens genéricas em produção

---

## 10. Deployment

### Opções de hospedagem

#### Backend — Railway / Render

1. **Railway** (recomendado para iniciar)
   - Conecte seu repositório GitHub
   - Selecione Branch `master`
   - Configure variáveis de ambiente: `JWT_SECRET`, `ANTHROPIC_API_KEY`, `CORS_ORIGIN`
   - Railway gerencia `PORT` automaticamente
   - PostgreSQL: use provisionado no Railway ou Supabase (free tier 500MB)

2. **Render**
   - Similar ao Railway
   - Free tier: 750h/mês (sempre ativo, não dorme como Heroku)
   - Database: Supabase (PostgreSQL free tier)

#### Banco de dados — Supabase vs Railway

| Supabase | Railway |
|---|---|
| **Free**: 500MB, 2 query/s | **Free**: incluído no plano |
| Auto-backup | Backups automáticos |
| Perfeito para MVP | Simples integração com Railway |

**Recomendado para iniciar**: Railway Backend + Supabase Database

#### Extensão — Chrome Web Store

1. Crie uma conta no [Chrome Web Store](https://chrome.google.com/webstore/devconsole/)
2. **Taxa única**: $5 USD
3. Faça build para produção:
   ```bash
   cd extension
   pnpm build  # Aponta para api.respondera.com.br (ou seu domínio)
   ```
4. Zipifique `extension/dist/`
5. Upload na console do Web Store

### Checklist de produção

- [ ] `JWT_SECRET` gerado com 32+ caracteres aleatórios (`openssl rand -base64 32`)
- [ ] `CORS_ORIGIN` restrito a domínio da extensão (não `*`)
- [ ] `ANTHROPIC_API_KEY` nunca commitado (verificar `.gitignore`)
- [ ] Migração de banco de dados rodada no Supabase/Railway
- [ ] Logs monitorados (verificar Winston logs para erros)
- [ ] Rate limiting testado (tentar 11 requisições rapidamente)
- [ ] Sanitização testada (tentar injetar HTML no review, verificar se é removido)
- [ ] Endpoint de health check rodando: `GET /health`
- [ ] Cache de distribuição (CDN) ativado se disponível

### Comando para gerar secrets seguros

```bash
# JWT_SECRET (32 chars, base64)
openssl rand -base64 32

# Ou via Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Variáveis de ambiente para produção

```env
DATABASE_URL="postgresql://user:pass@host:5432/db"
JWT_SECRET="<gerado-com-openssl>"
ANTHROPIC_API_KEY="sk-ant-<sua-chave>"
PORT="3000"
CORS_ORIGIN="https://api.respondera.com.br"
NODE_ENV="production"
```

---

## 11. Monitoração e manutenção

### Logs

- Winston salva em `logs/` (configure em `logger.ts`)
- Integre com serviço como Sentry, Loggly, ou Datadog em produção

### Métricas

- Monitore:
  - Taxa de requisições (rate limit hits)
  - Taxa de erro (ZodError, API errors)
  - Latência de geração de IA (tempo com Claude)
  - Taxa de uso por plano (para upsell)

### Pagamento (Mercado Pago — futuro)

- Campo `plan` já existe no schema `User` (valores: `FREE`, `PRO`)
- Integrar webhook de Mercado Pago para atualizar `plan` após pagamento
- Validar `remainingUsage` antes de gerar resposta

---

## 12. Troubleshooting

| Problema | Solução |
|---|---|
| "Cannot find module 'redis'" | Rate limiter usa memória local. Em produção, remova importações de Redis. ✅ Já feito. |
| Extensão não injecta botão | Verifique `content.ts` está compilado em `dist/content.js`. Recarge extensão (↺). |
| Painel não carrega | Inspecionar DevTools da extensão (`chrome://extensions/` → Detalhes → Errors). |
| API retorna 401 | Token expirado (30 dias). Faça login novamente. |
| "rate limit exceeded" | Aguarde 15min (login) ou 1h (geração). |

