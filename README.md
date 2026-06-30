# CoiAdditionalInsuredProver

Prove every vendor's certificate actually names you as additional insured with the right endorsement form, not just a checked box on the ACORD 25.

CoiAdditionalInsuredProver is a multi-tenant SaaS platform for risk managers and contract-compliance leads at general contractors and large property developers. It ingests subcontractor Certificates of Insurance (ACORD 25 plus attached endorsements), parses them into structured coverage lines, and then deterministically proves, with reason codes, that each certificate actually transfers risk: that the correct additional-insured endorsement form was provided (CG 20 10, CG 20 37, blanket AI, etc.), that primary-and-noncontributory wording is present, that waiver-of-subrogation applies, and that limits meet the contract's requirements. The product grades the endorsement, not the checkbox.

See the full feature specification in [docs/idea.md](docs/idea.md).

## Stack

- **Backend:** Hono (Node, TypeScript, ESM) running via `tsx`, Drizzle ORM over Neon Postgres.
- **Frontend:** Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS 4.
- **Auth:** Neon Auth (`@neondatabase/auth`). The Next.js proxy resolves the server-side session and forwards a trusted `X-User-Id` header to the backend.
- **Database:** Neon Postgres (provisioned out-of-band; the app seeds sample data but does not create its own tables).
- **Package manager:** pnpm everywhere.

The backend mounts every domain router under `/api/v1/*` and exposes a root `/health` endpoint. The browser never calls the backend directly; it calls same-origin `/api/proxy/*` routes which inject `X-User-Id` after session resolution.

## Local Development

Prerequisites: Node 22+, pnpm, and a Neon Postgres database URL.

### Backend

```bash
cd backend
pnpm install
cp .env.example .env   # then fill in DATABASE_URL and FRONTEND_URL
pnpm dev               # starts on http://localhost:3001
```

### Frontend

```bash
cd web
pnpm install
cp .env.example .env.local   # then fill in the NEON_AUTH_* and NEXT_PUBLIC_API_URL values
pnpm dev                     # starts on http://localhost:3000
```

Visit http://localhost:3000, sign up, and the sample-data seeder loads a realistic GC subcontractor portfolio for instant demoability.

### Docker Compose

To bring backend and web up together:

```bash
docker compose up --build
```

Backend serves on port 3001 and web on port 3000.

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description |
|----------|-------------|
| `PORT` | Backend port (defaults to 3001 locally; Render injects 10000). |
| `DATABASE_URL` | Neon Postgres connection string (`?sslmode=require`). |
| `FRONTEND_URL` | Allowed CORS origin for the web app (e.g. `http://localhost:3000`). |
| `ADMIN_USER_IDS` | Optional comma-separated list of admin user IDs. |
| `STRIPE_SECRET_KEY` | Optional. Billing is wired but optional; checkout/portal/webhook return 503 when unset. |
| `STRIPE_PRO_PRICE_ID` | Optional Stripe price ID for the pro plan. |
| `STRIPE_WEBHOOK_SECRET` | Optional Stripe webhook signing secret. |

### Frontend (`web/.env.local`)

| Variable | Description |
|----------|-------------|
| `NEON_AUTH_BASE_URL` | Neon Auth endpoint base URL (server-only). |
| `NEON_AUTH_COOKIE_SECRET` | Random 32-byte hex secret for auth cookies (server-only). |
| `NEXT_PUBLIC_API_URL` | Backend base URL, baked into the bundle at build time and read by the proxy route. |

## Billing

All features are free for signed-in users. Stripe billing is wired but optional: `GET /api/v1/billing/plan` always works, and checkout/portal/webhook endpoints return `503` when `STRIPE_SECRET_KEY` is unconfigured.

## Deployment

- **Backend:** Render, configured via [render.yaml](render.yaml) (Variant A: `cd backend && pnpm install` build, `cd backend && node --import tsx/esm src/index.ts` start). Set `DATABASE_URL` and `FRONTEND_URL` as Render env vars.
- **Frontend:** Vercel, with `framework: nextjs`, `rootDirectory: web`, `nodeVersion: 22.x`.

Provision the Neon Postgres schema out-of-band before first boot; the app seeds sample data but does not create its own tables.
