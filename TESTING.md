# Guia de Testes — Prompt 10 (Security Hardening)

## 1. Setup para Testes

Certifique-se de que o backend está rodando:

```bash
cd backend
pnpm dev
```

O servidor sobe em `http://localhost:3333`

---

## 2. Testes de Validação (Zod)

### 2.1 — Validação de Email no Registro

**Teste**: Enviar email inválido
```bash
curl -X POST http://localhost:3333/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "invalido", "password": "senha123"}'
```

**Resultado esperado**: 400 com mensagem de erro Zod
```json
{"error": "Invalid email"}
```

---

### 2.2 — Validação de Senha (mínimo 6 caracteres)

**Teste**: Senha muito curta
```bash
curl -X POST http://localhost:3333/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "123"}'
```

**Resultado esperado**: 400
```json
{"error": "String must contain at least 6 character(s)"}
```

---

### 2.3 — Validação de Rating (1-5)

**Teste**: Rating inválido
```bash
curl -X POST http://localhost:3333/reply/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"reviewText": "Ótimo!", "rating": 10, "tone": "friendly"}'
```

**Resultado esperado**: 400
```json
{"error": "Number must be less than or equal to 5"}
```

---

### 2.4 — Validação de reviewText (máx 2000 chars)

**Teste**: Texto muito grande
```bash
curl -X POST http://localhost:3333/reply/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d "{\"reviewText\": \"$(printf 'a%.0s' {1..2001})\", \"rating\": 5, \"tone\": \"friendly\"}"
```

**Resultado esperado**: 400
```json
{"error": "String must contain at most 2000 character(s)"}
```

---

### 2.5 — Validação de additionalContext (máx 300 chars)

**Teste**: Context muito grande
```bash
curl -X POST http://localhost:3333/reply/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d "{\"reviewText\": \"Bom\", \"rating\": 5, \"tone\": \"friendly\", \"additionalContext\": \"$(printf 'x%.0s' {1..301})\"}"
```

**Resultado esperado**: 400
```json
{"error": "String must contain at most 300 character(s)"}
```

---

## 3. Testes de Sanitização

### 3.1 — HTML Stripping em reviewText

**Teste**: Injetar HTML no review
```bash
curl -X POST http://localhost:3333/reply/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"reviewText": "Ótimo <script>alert(1)</script>", "rating": 5, "tone": "friendly"}'
```

**Resultado esperado**: O HTML é removido antes do processamento
- Tags `<script>`, `<img>`, `<iframe>`, etc. são todas removidas
- A IA recebe: "Ótimo alert(1)"
- Resposta normal (sem erro)

---

### 3.2 — HTML Stripping em additionalContext

**Teste**: Injetar HTML no contexto adicional
```bash
curl -X POST http://localhost:3333/reply/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"reviewText": "Bom", "rating": 4, "tone": "friendly", "additionalContext": "Mencione <b>promoção</b>"}'
```

**Resultado esperado**: Tags removidas
- A IA recebe: "Mencione promoção"

---

## 4. Testes de Rate Limiting

### 4.1 — Rate Limit de Login (10/15 min por IP)

**Teste**: Tentar login 11 vezes seguidas
```bash
for i in {1..11}; do
  curl -X POST http://localhost:3333/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email": "test@example.com", "password": "wrongpass"}' \
    -w "\nTentativa $i — Status: %{http_code}\n"
  sleep 0.5
done
```

**Resultado esperado**:
- Primeiras 10 requisições: 401 (Unauthorized) ou 500 (erro interno)
- 11ª requisição: 429 (Too Many Requests)
```json
{"error": "Muitas tentativas de login. Tente novamente em 15 minutos."}
```

---

### 4.2 — Rate Limit de Geração (30/hora por usuário)

**Teste**: Fazer 31 requisições de `/reply/generate`
```bash
# Você precisaria de um token válido
for i in {1..31}; do
  curl -X POST http://localhost:3333/reply/generate \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer <token>" \
    -d '{"reviewText": "Teste", "rating": 5, "tone": "friendly"}' \
    -w "\nRequisição $i — Status: %{http_code}\n"
  sleep 0.3
done
```

**Resultado esperado**:
- Primeiras 30: 200 (ou erro se no limit de uso)
- 31ª: 429 (Rate limited)

---

## 5. Testes de Logging (SEM SECRETS)

### 5.1 — Verificar que Senhas NÃO são Logadas

**Passo 1**: Abra `logs/combined.log` (ou console do `pnpm dev`)

**Passo 2**: Faça registro/login
```bash
curl -X POST http://localhost:3333/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "secrettest@example.com", "password": "mySecretPassword123"}'
```

**Passo 3**: Procure no log por:
- ❌ "mySecretPassword123" — NÃO deve aparecer
- ❌ A senha inteira em lugar nenhum
- ✅ Deve aparecer: "User registered" com email mascarado "sec***"

**Exemplo de log seguro**:
```json
{"level":"info","message":"User registered","userId":"8char...","email":"sec***"}
```

---

### 5.2 — Verificar que Tokens NÃO são Logados

**Teste**: Faça login e inspecione os logs
```bash
curl -X POST http://localhost:3333/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "senha123"}'
```

**Resultado esperado**:
- ❌ Token JWT NÃO aparece em logs
- ✅ Apenas "User login" com userId mascarado

---

### 5.3 — Verificar Erro Logging (sem expor detalhes internos)

**Teste**: Enviar Zod error deliberadamente
```bash
curl -X POST http://localhost:3333/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "invalido", "password": "senha"}'
```

**Log esperado**:
- Erro genérico: "Erro ao fazer login. Tente novamente."
- NÃO expõe stack trace ou detalhes internos

---

## 6. Teste de Payload Limit (10KB máximo)

### 6.1 — Payload Muito Grande

**Teste**: Enviar payload > 10KB
```bash
# Cria um JSON de ~15KB
curl -X POST http://localhost:3333/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"test@example.com\", \"password\": \"$(printf 'x%.0s' {1..15000})\"}"
```

**Resultado esperado**: 413 (Payload Too Large)
```json
{"error": "request entity too large"}
```

---

## 7. Teste de Helmet (Headers de Segurança)

**Teste**: Verifique headers HTTP
```bash
curl -I http://localhost:3333/health
```

**Headers esperados**:
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=...
Content-Security-Policy: ...
```

---

## 8. Teste de Email Sanitization

### 8.1 — Email RFC 5321 Compliant

**Teste**: Emails inválidos
```bash
# Falta @
curl -X POST http://localhost:3333/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "testexample.com", "password": "senha123"}'

# Domain inválido
curl -X POST http://localhost:3333/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "test@.com", "password": "senha123"}'
```

**Resultado esperado**: 400 com "Invalid email"

---

## 9. Teste End-to-End (E2E) Completo

### 9.1 — Fluxo Completo: Registrar → Login → Gerar Resposta

**Passo 1**: Registrar usuário
```bash
curl -X POST http://localhost:3333/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "e2etest@example.com", "password": "senha123456"}'
```
Salve o `token` da resposta.

**Passo 2**: Criar negócio (contexto)
```bash
curl -X POST http://localhost:3333/business \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"name": "Restaurante XYZ", "segment": "Restaurante", "tone": "FORMAL"}'
```

**Passo 3**: Gerar resposta
```bash
curl -X POST http://localhost:3333/reply/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "reviewText": "Ótimo atendimento! Voltarei com certeza.",
    "rating": 5,
    "reviewerName": "João Silva",
    "tone": "friendly",
    "additionalContext": "Cliente é nosso habitual, sempre vem aos fins de semana"
  }'
```

**Resultado esperado**: 200 com resposta gerada pela IA
```json
{
  "reply": "Muito obrigado, João! Ficamos felizes em recebê-lo novamente...",
  "tokensUsed": 245,
  "remainingUsage": 9
}
```

---

## 10. Checklist de Segurança

- [ ] Rate limiting respondendo 429 após limite
- [ ] Zod validando todos os tipos de input
- [ ] HTML sendo removido de reviewText e additionalContext
- [ ] Senhas NÃO aparecem em logs
- [ ] Tokens NÃO aparecem em logs
- [ ] Email mascarado em logs (sec***)
- [ ] Payload limit retornando 413
- [ ] Helmet headers presentes
- [ ] Erros genéricos em produção
- [ ] Email validado com RFC 5321
