<div align="center">

<img src="extension/public/icons/icon128.png" width="72" alt="Respondera logo" />

# Respondera

**A Chrome extension that writes replies to Google Business Profile reviews using AI.**

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?logo=express&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white)
![Chrome MV3](https://img.shields.io/badge/Chrome_Extension-MV3-4285F4?logo=googlechrome&logoColor=white)
![Claude API](https://img.shields.io/badge/Claude_API-D97757?logo=anthropic&logoColor=white)
![Stripe](https://img.shields.io/badge/Stripe-635BFF?logo=stripe&logoColor=white)

[![CI](https://github.com/giobroliatto/respondera/actions/workflows/ci.yml/badge.svg)](https://github.com/giobroliatto/respondera/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

</div>

[Português](README.md) · **English**

> [!NOTE]
> Respondera was a SaaS I designed, built and took to market: the extension went live on the [Chrome Web Store](https://chromewebstore.google.com/detail/respondera/jjoaagmkfjgncaflfdjaeahfpabefibb), backed by a production API, a landing page and paid subscriptions through Stripe. The product has since been discontinued and the code is open as a portfolio project. The extension is still listed on the store, but the server has been shut down, so it no longer works once installed. To try it, follow the [running locally](#running-locally) instructions.
>
> The product was built for the Brazilian market, so the UI, the prompts and the code comments are in Portuguese.

![Respondera landing page](docs/landing.png)

---

## The problem

Replying to Google reviews improves a business's ranking on Maps and shows people searching that someone is on the other side. Even so, most small businesses leave reviews unanswered. Writing one reply is easy. Writing fifty, without sounding robotic and without losing your temper over an unfair review, is a different story.

## The solution

Respondera adds a **"Reply with AI"** button right on the Google Business Profile reviews screen. The owner clicks it, picks a tone and gets a ready reply to review and publish. No copy and paste, no switching tabs.

<table>
<tr>
<td width="55%" valign="top">

### How it works

1. The extension detects each review on the Google page and injects its button next to "Reply".
2. Clicking it opens a side panel with the review text, rating and reviewer name, extracted from the page.
3. The user chooses between **generating from scratch** or **improving a draft** they wrote themselves.
4. They pick a tone (Friendly, Formal, Empathetic, Direct, Casual, Assertive or a custom tone) and can add extra context ("we already sorted this out over the phone").
5. The reply shows up in seconds. **"Use this reply"** puts the text straight into Google's reply field.

### Plans

| | Free | Pro (R$ 29.90/month) |
|---|---|---|
| Replies per month | 10 | Unlimited |
| Tones | 3 | 6 + custom tones |
| Generate or improve a draft | ✅ | ✅ |
| Business profile in the prompt (name, segment, highlights, average ticket) | | ✅ |
| Solo professional voice (first person singular, male/female) | | ✅ |
| Extra context per review | | ✅ |

</td>
<td width="45%" valign="top">

<img src="docs/painel.png" alt="Extension side panel with a generated reply" />

<sub>The extension's side panel. The review and the reply are an illustrative example.</sub>

</td>
</tr>
</table>

---

## Architecture

```mermaid
flowchart LR
    subgraph Chrome["Chrome (MV3 extension)"]
        CS["content script<br/>(Google page)"]
        PN["panel<br/>(iframe)"]
        PP["popup<br/>(account, business, plan)"]
        BG["service worker"]
    end

    subgraph API["Backend (Node + Express)"]
        R["routes<br/>auth · business · reply<br/>custom-tones · payments"]
        DB[(PostgreSQL<br/>via Prisma)]
    end

    LP["Landing<br/>(Vercel)"]

    CS -- opens --> PN
    PN -- "generation request" --> BG
    BG -- "HTTPS + JWT" --> R
    PP -- "HTTPS + JWT" --> R
    PN -- "tones and account" --> R
    R --> DB
    R -- generates reply --> CL["Claude API"]
    R -- checkout and webhooks --> ST["Stripe"]
    R -- transactional email --> RS["Resend"]
    LP -- "PRO checkout, password reset" --> R
```

The repository has three parts:

| Folder | What it is |
|---|---|
| [`extension/`](extension) | Chrome extension (Manifest V3) in plain TypeScript, bundled with Webpack. Content script, side panel, popup and service worker. |
| [`backend/`](backend) | REST API in Node.js + Express + Prisma/PostgreSQL. Authentication, usage limits, AI generation, subscriptions and email. |
| [`landing/`](landing) | Static site hosted on Vercel: landing page, PRO subscription page, password reset and privacy policy. |

---

## Technical highlights

### Integrating with a page I don't control

Google Business Profile has no public API for this, and its interface runs inside iframes with obfuscated CSS classes that change without notice. [`content.ts`](extension/src/content.ts) runs in every frame (`all_frames`) and uses a `MutationObserver` to keep up with reviews loaded dynamically. Elements are found through **selector lists ordered by stability**: `aria-label` and semantic attributes first, then the visible button text in Portuguese and English, and only last the class names observed on the live page. That way, a layout change on Google's side degrades the extension gradually instead of breaking it all at once. The panel runs in the extension's own isolated iframe, so Google's CSS doesn't leak into it and vice versa.

### Prompt engineering

[`anthropicService.ts`](backend/src/services/anthropicService.ts) builds the prompt from rules that came out of testing real replies:

- **Length proportional to the rating.** A 5★ review with no text gets one sentence. A 1★ complaint gets three: acknowledge the problem, apologize and offer a contact channel outside Google, without promising a refund.
- **Configurable voice.** The reply is written in the company's voice ("we appreciate") or a solo professional's ("I appreciate"), with the right grammatical gender.
- **Prompt injection protection.** The review text and the draft are wrapped in tags and the model is told to treat them as data. A review saying "ignore previous instructions" changes nothing.
- **Two modes with different temperatures.** "Generate" uses temperature 1 for variety. "Improve draft" uses 0.3, because what matters there is staying faithful to what the owner meant: the model fixes the tone and the writing, but doesn't add facts or flip the author's position.
- **Human style.** No emojis, no markdown, no generic sign-offs and no em dashes. Em dashes are also stripped after generation, because the model keeps using them anyway.

### Security and business rules on the server

- Every plan rule (monthly limit, exclusive tones, business context) is enforced **on the backend**. The plan is read from the database on every request, not from the JWT, so an upgrade or cancellation takes effect immediately.
- Logout and password changes invalidate every JWT issued before that moment (`tokenInvalidatedAt`).
- Email verification with a 6-digit code and password reset by link, both **stored as SHA-256 hashes**, with expiration and attempt limits.
- Per-route rate limiting: login/sign-up, reply generation, code resend and code verification.
- Zod validation, HTML sanitization, a 10 KB payload limit, Helmet and structured logs (Winston) that mask emails and IDs.
- The Stripe webhook receives the raw body (`express.raw`) so the signature is verified before anything is processed.

### Automated tests

- **Backend:** Vitest and Supertest tests cover prompt building, input sanitization and validation, the authentication and usage-limit middlewares, and the reply generation route end to end. The database and the Anthropic API are mocked, so the tests can check, for example, that a FREE user never sends the business profile to the model.
- **Extension:** the real content script runs against the mock page in jsdom. The tests check button injection, data extraction for each review, inserting the reply into the right field, and that messages coming from outside the panel are ignored.
- **CI:** GitHub Actions runs type checking, tests and the build for both parts on every push.

### A complete product, not just code

Beyond the core, Respondera had what a real SaaS needs: onboarding with a post-install welcome page, a "forgot password" flow, transactional emails, checkout and subscription management (cancel and resume), a landing page with a demo video, analytics and a privacy policy (LGPD, Brazil's data protection law).

---

## Stack

| Layer | Technologies |
|---|---|
| Extension | TypeScript, Chrome Extensions Manifest V3, Webpack, `chrome.storage` |
| Backend | Node.js 22, Express, Prisma, PostgreSQL, Zod, JWT, bcrypt, Helmet, express-rate-limit, Winston |
| AI | Claude API (Anthropic SDK) |
| Payments and email | Stripe (Checkout + Webhooks), Resend |
| Landing | Static HTML/CSS/JS, Vercel, Vercel Analytics |
| Tests and CI | Vitest, Supertest, jsdom, GitHub Actions |

---

## Running locally

> The code still works, but the production backend (`api.respondera.com.br`) has been shut down, so the Chrome Web Store version can't generate replies. To try it, run the backend locally and use the mock page included in the repository.

**Requirements:** Node.js 22+, pnpm 9+, Docker and Google Chrome. You'll need an [Anthropic API](https://console.anthropic.com) key. Stripe and Resend are optional in development: without a Resend key, verification codes are printed to the console.

### 1. Database

```bash
cd backend
docker compose up -d
```

### 2. Backend

```bash
cd backend
pnpm install
cp .env.example .env    # fill in DATABASE_URL, JWT_SECRET and ANTHROPIC_API_KEY
pnpm prisma:migrate
pnpm dev                # http://localhost:3333 (GET /health to check)
```

With the included `docker-compose.yml`, the connection string is `postgresql://respondera:respondera@localhost:5432/respondera`.

### 3. Extension

```bash
cd extension
pnpm install
pnpm build:dev          # build pointing to localhost:3333 (or `pnpm dev` to watch)
```

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select `extension/dist/`.

### 4. Testing without a Business Profile

[`extension/mock/mock-reviews.html`](extension/mock/mock-reviews.html) imitates Google's reviews screen. The development build already allows the extension on `localhost:8081`, so you only need to serve the mock:

```bash
cd extension
pnpm mock               # open http://localhost:8081/mock-reviews.html
```

Then create an account from the extension popup, enter the verification code printed in the backend console and click **"Responder com IA"** on any review in the mock.

### 5. Tests

```bash
cd backend && pnpm test         # no database or Anthropic key needed
cd ../extension && pnpm test
```

<details>
<summary><strong>Backend environment variables</strong></summary>

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret used to sign JWTs (`openssl rand -base64 32`) |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key |
| `PORT` | No | Server port (default `3333`) |
| `CORS_ORIGIN` | No | Allowed origins, comma-separated (default `*`) |
| `PUBLIC_API_URL` | In production | Public API URL, used in email links |
| `RESEND_API_KEY`, `EMAIL_FROM` | In production | Transactional email |
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` | In production | PRO subscription |

</details>

<details>
<summary><strong>Available scripts</strong></summary>

**Backend**

| Script | Description |
|---|---|
| `pnpm dev` | Server in watch mode (tsx) |
| `pnpm build` / `pnpm start` | Compile and run the production build |
| `pnpm prisma:migrate` | Create and apply migrations |
| `pnpm prisma:migrate:deploy` | Apply migrations in production |
| `pnpm prisma:studio` | Open Prisma Studio |
| `pnpm test` / `pnpm test:watch` | Run the tests |
| `pnpm typecheck` | Type-check without compiling |

**Extension**

| Script | Description |
|---|---|
| `pnpm dev` | Watch build pointing to localhost |
| `pnpm build:dev` | One-off development build |
| `pnpm build` | Production build |
| `pnpm mock` | Serve the mock at http://localhost:8081 |
| `pnpm icons` | Generate the icons from the SVG |
| `pnpm test` / `pnpm test:watch` | Run the tests |
| `pnpm typecheck` | Type-check without compiling |

</details>

<details>
<summary><strong>API endpoints</strong></summary>

| Method | Route | Description |
|---|---|---|
| `POST` | `/auth/register`, `/auth/login`, `/auth/logout` | Account and session |
| `GET` | `/auth/me` | Account data, plan and usage |
| `POST` | `/auth/verify-email-code`, `/auth/resend-verification` | Email verification |
| `POST` | `/auth/forgot-password`, `/auth/reset-password` | Password reset |
| `GET` / `POST` | `/business` | Business profile |
| `GET` / `POST` / `PUT` / `DELETE` | `/custom-tones` | Custom tones (PRO) |
| `POST` | `/reply/generate` | Generate or improve a reply |
| `POST` | `/payments/create-subscription`, `/payments/cancel-subscription`, `/payments/resume-subscription` | Subscription |
| `POST` | `/payments/webhook` | Stripe webhook |
| `GET` | `/health` | Health check |

</details>

---

## License

[MIT](LICENSE)

---

## Author

Built by **Giovani Broliatto**: product, design, code and whatever else it took.

[![LinkedIn](https://img.shields.io/badge/LinkedIn-giobroliatto-0A66C2?logo=linkedin&logoColor=white)](https://www.linkedin.com/in/giobroliatto/)
