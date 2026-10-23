<div align="center">

<img src="extension/public/icons/icon128.png" width="72" alt="Logo do Respondera" />

# Respondera

**Extensão do Chrome que escreve respostas para avaliações do Google Perfil de Empresas usando IA.**

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?logo=express&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)
![Chrome MV3](https://img.shields.io/badge/Chrome_Extension-MV3-4285F4?logo=googlechrome&logoColor=white)
![Claude API](https://img.shields.io/badge/Claude_API-D97757?logo=anthropic&logoColor=white)
![Stripe](https://img.shields.io/badge/Stripe-635BFF?logo=stripe&logoColor=white)

[![CI](https://github.com/giobroliatto/respondera/actions/workflows/ci.yml/badge.svg)](https://github.com/giobroliatto/respondera/actions/workflows/ci.yml)
[![Licença MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-green)](LICENSE)

</div>

[English](README.md) · **Português**

> [!NOTE]
> O Respondera foi um SaaS que idealizei, desenvolvi e coloquei no ar: a extensão chegou à [Chrome Web Store](https://chromewebstore.google.com/detail/respondera/jjoaagmkfjgncaflfdjaeahfpabefibb), com backend em produção, landing page e assinatura paga via Stripe. Hoje o produto está descontinuado e o código fica aberto como portfólio. A extensão ainda aparece na loja, mas o servidor foi desligado, então ela não funciona mais depois de instalada. Para testar, siga as instruções de [como rodar localmente](#rodando-localmente).

![Landing page do Respondera](docs/landing.png)

---

## O problema

Responder avaliações no Google melhora o posicionamento do negócio no Maps e mostra para quem está pesquisando que existe alguém do outro lado. Mesmo assim, a maioria dos pequenos negócios deixa avaliações sem resposta. Escrever uma resposta é fácil. Escrever cinquenta, sem soar robótico e sem perder a calma com uma avaliação injusta, já é outra história.

## A solução

O Respondera coloca um botão **"Responder com IA"** direto na tela de avaliações do Google Perfil de Empresas. O dono do negócio clica, escolhe o tom e recebe uma resposta pronta para revisar e publicar. Não precisa copiar e colar nem trocar de aba.

<table>
<tr>
<td width="55%" valign="top">

### Como funciona

1. A extensão detecta cada avaliação na página do Google e injeta o botão ao lado de "Responder".
2. Ao clicar, abre um painel lateral com o texto, a nota e o nome de quem avaliou, extraídos da página.
3. O usuário escolhe entre **gerar do zero** ou **melhorar um rascunho** que ele mesmo escreveu.
4. Escolhe o tom (Amigável, Formal, Empático, Direto, Descontraído, Assertivo ou um tom personalizado) e, se quiser, dá um contexto extra ("já resolvemos isso por telefone").
5. A resposta aparece em segundos. Com **"Usar esta resposta"**, o texto vai direto para o campo de resposta do Google.

### Planos

| | Free | Pro (R$ 29,90/mês) |
|---|---|---|
| Respostas por mês | 10 | Ilimitadas |
| Tons | 3 | 6 + tons personalizados |
| Gerar ou melhorar rascunho | ✅ | ✅ |
| Perfil do negócio no prompt (nome, segmento, diferenciais, ticket médio) | | ✅ |
| Voz de profissional autônomo (1ª pessoa do singular, masc./fem.) | | ✅ |
| Contexto adicional por avaliação | | ✅ |

</td>
<td width="45%" valign="top">

<img src="docs/painel.png" alt="Painel lateral da extensão com uma resposta gerada" />

<sub>Painel lateral da extensão. A avaliação e a resposta são um exemplo ilustrativo.</sub>

</td>
</tr>
</table>

---

## Arquitetura

```mermaid
flowchart LR
    subgraph Chrome["Chrome (extensão MV3)"]
        CS["content script<br/>(página do Google)"]
        PN["painel<br/>(iframe)"]
        PP["popup<br/>(conta, negócio, plano)"]
        BG["service worker"]
    end

    subgraph API["Backend (Node + Express)"]
        R["rotas<br/>auth · business · reply<br/>custom-tones · payments"]
        DB[(PostgreSQL<br/>via Prisma)]
    end

    LP["Landing<br/>(Vercel)"]

    CS -- abre --> PN
    PN -- "pedido de geração" --> BG
    BG -- "HTTPS + JWT" --> R
    PP -- "HTTPS + JWT" --> R
    PN -- "tons e conta" --> R
    R --> DB
    R -- gera resposta --> CL["Claude API"]
    R -- checkout e webhooks --> ST["Stripe"]
    R -- e-mails transacionais --> RS["Resend"]
    LP -- "checkout PRO, reset de senha" --> R
```

O repositório tem três partes:

| Pasta | O que é |
|---|---|
| [`extension/`](extension) | Extensão Chrome (Manifest V3) em TypeScript puro, empacotada com Webpack. Content script, painel lateral, popup e service worker. |
| [`backend/`](backend) | API REST em Node.js + Express + Prisma/PostgreSQL. Autenticação, limites de uso, geração com IA, assinaturas e e-mails. |
| [`landing/`](landing) | Site estático hospedado na Vercel: landing page, página de assinatura PRO, redefinição de senha e política de privacidade. |

---

## Destaques técnicos

### Integração com uma página que não é minha

O Google Perfil de Empresas não tem API pública para isso, e a interface roda em iframes com classes CSS ofuscadas que mudam sem aviso. O [`content.ts`](extension/src/content.ts) roda em todos os frames (`all_frames`) e usa um `MutationObserver` para acompanhar avaliações carregadas dinamicamente. Os elementos são localizados por **listas de seletores em ordem de estabilidade**: primeiro `aria-label` e atributos semânticos, depois o texto visível dos botões em português e inglês, e só por último as classes observadas na página real. Assim, uma mudança de layout do Google degrada a extensão aos poucos em vez de quebrá-la de uma vez. O painel roda num iframe isolado da extensão, então o CSS do Google não vaza para dentro dele e vice-versa.

### Engenharia de prompt

O [`anthropicService.ts`](backend/src/services/anthropicService.ts) monta o prompt a partir de regras que surgiram testando respostas reais:

- **Tamanho proporcional à nota.** Um 5★ sem texto recebe uma frase. Um 1★ com reclamação recebe três: reconhece o problema, pede desculpas e oferece um canal de contato fora do Google, sem prometer reembolso.
- **Voz configurável.** A resposta sai na voz da empresa ("agradecemos") ou de um profissional autônomo ("agradeço"), com concordância de gênero.
- **Proteção contra prompt injection.** O texto da avaliação e o rascunho entram delimitados por tags e o modelo é instruído a tratá-los como dados. Uma avaliação que diz "ignore as instruções anteriores" não muda nada.
- **Dois modos com temperaturas diferentes.** "Gerar" usa temperatura 1 para ter variedade. "Melhorar rascunho" usa 0.3, porque aqui o que importa é ser fiel ao que o dono quis dizer: o modelo melhora o registro e a escrita, mas não acrescenta fatos nem inverte a posição do autor.
- **Estilo humano.** Sem emojis, sem markdown, sem fechamentos genéricos e sem travessões. Os travessões também são removidos depois da geração, porque o modelo insiste em usá-los.

### Segurança e regras de negócio no servidor

- Todas as regras de plano (limite mensal, tons exclusivos, contexto do negócio) são aplicadas **no backend**. O plano é lido do banco a cada requisição, e não do JWT, para que um upgrade ou cancelamento valha na hora.
- Logout e troca de senha invalidam todos os JWTs emitidos antes daquele momento (`tokenInvalidatedAt`).
- Verificação de e-mail por código de 6 dígitos e redefinição de senha por link, ambos com **hash SHA-256 no banco**, expiração e limite de tentativas.
- Rate limiting por rota: login/registro, geração de respostas, reenvio de código e verificação.
- Validação com Zod, sanitização de HTML, limite de 10 KB por payload, Helmet e logs estruturados (Winston) que mascaram e-mails e IDs.
- O webhook do Stripe recebe o corpo cru (`express.raw`) para validar a assinatura antes de qualquer processamento.

### Testes automatizados

- **Backend:** testes com Vitest e Supertest cobrem a montagem do prompt, a sanitização e validação de entrada, os middlewares de autenticação e de limite de uso e a rota de geração de ponta a ponta. O banco e a API da Anthropic são simulados, então dá para conferir, por exemplo, que um usuário FREE nunca manda o perfil do negócio para o modelo.
- **Extensão:** o content script roda de verdade sobre a página de mock em jsdom. Os testes conferem a injeção dos botões, a extração dos dados de cada avaliação, a inserção da resposta no campo certo e que mensagens vindas de fora do painel são ignoradas.
- **CI:** o GitHub Actions roda typecheck, testes e build das duas partes a cada push.

### Produto completo, não só código

Além do núcleo, o Respondera tinha o que um SaaS real precisa: onboarding com página de boas-vindas pós-instalação, fluxo de "esqueci minha senha", e-mails transacionais, checkout e gerenciamento de assinatura (cancelar e reativar), landing com vídeo demonstrativo, analytics e política de privacidade (LGPD).

---

## Stack

| Camada | Tecnologias |
|---|---|
| Extensão | TypeScript, Chrome Extensions Manifest V3, Webpack, `chrome.storage` |
| Backend | Node.js 22, Express, Prisma, PostgreSQL, Zod, JWT, bcrypt, Helmet, express-rate-limit, Winston |
| IA | Claude API (Anthropic SDK) |
| Pagamentos e e-mail | Stripe (Checkout + Webhooks), Resend |
| Landing | HTML/CSS/JS estático, Vercel, Vercel Analytics |
| Testes e CI | Vitest, Supertest, jsdom, GitHub Actions |

---

## Rodando localmente

> O código continua funcional, mas o backend de produção (`api.respondera.com.br`) foi desligado, então a versão da Chrome Web Store não consegue gerar respostas. Para testar, rode o backend local e use a página de mock incluída no repositório.

**Pré-requisitos:** Node.js 22+, pnpm 9+, Docker e Google Chrome. Você vai precisar de uma chave da [API da Anthropic](https://console.anthropic.com). Stripe e Resend são opcionais em desenvolvimento: sem a chave do Resend, os códigos de verificação aparecem no console.

### 1. Banco de dados

```bash
cd backend
docker compose up -d
```

### 2. Backend

```bash
cd backend
pnpm install
cp .env.example .env    # preencha DATABASE_URL, JWT_SECRET e ANTHROPIC_API_KEY
pnpm prisma:migrate
pnpm dev                # http://localhost:3333 (GET /health para conferir)
```

Com o `docker-compose.yml` incluído, a connection string é `postgresql://respondera:respondera@localhost:5432/respondera`.

### 3. Extensão

```bash
cd extension
pnpm install
pnpm build:dev          # build apontando para localhost:3333 (ou `pnpm dev` para watch)
```

1. Abra `chrome://extensions` e ative o **Modo do desenvolvedor**.
2. Clique em **Carregar sem compactação** e selecione `extension/dist/`.

### 4. Testando sem um Perfil de Empresa

O arquivo [`extension/mock/mock-reviews.html`](extension/mock/mock-reviews.html) imita a tela de avaliações do Google. O build de desenvolvimento já libera a extensão em `localhost:8081`, então basta servir o mock:

```bash
cd extension
pnpm mock               # abra http://localhost:8081/mock-reviews.html
```

Depois, crie uma conta pelo popup da extensão, confirme o código de verificação que aparece no console do backend e clique em **"Responder com IA"** em qualquer avaliação do mock.

### 5. Testes

```bash
cd backend && pnpm test      # não precisa de banco nem de chave da Anthropic
cd ../extension && pnpm test
```

<details>
<summary><strong>Variáveis de ambiente do backend</strong></summary>

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | Sim | Connection string do PostgreSQL |
| `JWT_SECRET` | Sim | Segredo para assinar os JWTs (`openssl rand -base64 32`) |
| `ANTHROPIC_API_KEY` | Sim | Chave da API da Anthropic |
| `PORT` | Não | Porta do servidor (padrão `3333`) |
| `CORS_ORIGIN` | Não | Origens permitidas, separadas por vírgula (padrão `*`) |
| `PUBLIC_API_URL` | Em produção | URL pública da API, usada nos links de e-mail |
| `RESEND_API_KEY`, `EMAIL_FROM` | Em produção | Envio de e-mails transacionais |
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` | Em produção | Assinatura PRO |

</details>

<details>
<summary><strong>Scripts disponíveis</strong></summary>

**Backend**

| Script | Descrição |
|---|---|
| `pnpm dev` | Servidor em modo watch (tsx) |
| `pnpm build` / `pnpm start` | Compila e roda o build de produção |
| `pnpm prisma:migrate` | Cria e aplica migrations |
| `pnpm prisma:migrate:deploy` | Aplica migrations em produção |
| `pnpm prisma:studio` | Abre o Prisma Studio |
| `pnpm test` / `pnpm test:watch` | Roda os testes |
| `pnpm typecheck` | Checa os tipos sem compilar |

**Extensão**

| Script | Descrição |
|---|---|
| `pnpm dev` | Build em watch apontando para localhost |
| `pnpm build:dev` | Build único de desenvolvimento |
| `pnpm build` | Build de produção |
| `pnpm mock` | Serve o mock em http://localhost:8081 |
| `pnpm icons` | Gera os ícones a partir do SVG |
| `pnpm test` / `pnpm test:watch` | Roda os testes |
| `pnpm typecheck` | Checa os tipos sem compilar |

</details>

<details>
<summary><strong>Endpoints da API</strong></summary>

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/auth/register`, `/auth/login`, `/auth/logout` | Conta e sessão |
| `GET` | `/auth/me` | Dados da conta, plano e uso |
| `POST` | `/auth/verify-email-code`, `/auth/resend-verification` | Verificação de e-mail |
| `POST` | `/auth/forgot-password`, `/auth/reset-password` | Redefinição de senha |
| `GET` / `POST` | `/business` | Perfil do negócio |
| `GET` / `POST` / `PUT` / `DELETE` | `/custom-tones` | Tons personalizados (PRO) |
| `POST` | `/reply/generate` | Gera ou melhora uma resposta |
| `POST` | `/payments/create-subscription`, `/payments/cancel-subscription`, `/payments/resume-subscription` | Assinatura |
| `POST` | `/payments/webhook` | Webhook do Stripe |
| `GET` | `/health` | Health check |

</details>

---

## Licença

[MIT](LICENSE)

---

## Autor

Feito por **Giovani Broliatto**: produto, design, código e o que mais fosse preciso.

[![LinkedIn](https://img.shields.io/badge/LinkedIn-giobroliatto-0A66C2?logo=linkedin&logoColor=white)](https://www.linkedin.com/in/giobroliatto/)
