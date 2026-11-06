# Local setup

How to run TraceCode on your own machine. `README.md` ("Getting started") and
`.env.example` stay the source of truth for the generic workflow and for what
each variable does; this page covers what is specific to running the full
app (sign-in, saved progress, analytics) without touching anyone else's data.

## 1. Prerequisites

- Node ≥ 22.18 (`.nvmrc` says 22) and pnpm 10.6.2 (pinned in `package.json`;
  `corepack enable` picks it up).
- Windows: use WSL2 and clone under `~/`, not `/mnt/c/`.
- A Supabase project **of your own** and its Postgres database (section 3).

## 2. Clone and install

```bash
git clone https://github.com/Asadatf/tracecode.git && cd tracecode
git checkout main
./scripts/onboard.sh
```

`onboard.sh` runs `pnpm install`. Its
`postinstall` step generates the Prisma client and copies the Pyodide runtime
into `public/pyodide/` (gitignored, self-hosted per ADR-0002), so no CDN is
needed and a fresh install is all it takes. If `public/pyodide/` is missing,
run `node scripts/copy-pyodide.mjs`.

## 3. Your own Supabase project

**Use a separate project, not the team's.** Sharing one means sharing user
rows, learning records and the `_prisma_migrations` history: one
`prisma migrate dev` or a test-account cleanup on either side hits the other,
and the service key would have to be passed around. A free project costs
nothing and keeps experiments out of the shared data.

In your project's dashboard:

1. **Project Settings → API**: copy the project URL, the publishable key
   (`sb_publishable_…`) and a secret key (`sb_secret_…`).
2. **Project Settings → Database → Connection string**: copy the
   **transaction pooler** (port 6543) and the **direct** (port 5432) strings.
3. **Authentication → Providers → Email**: enabled. Turn **Confirm email
   off** for development, otherwise sign-up returns "Check your email" and
   Supabase's built-in mailer is heavily rate-limited.
4. **Authentication → URL Configuration**: Site URL `http://localhost:3000`;
   add `http://localhost:3000/**` to Redirect URLs. The app uses email +
   password only and has no auth-callback route, so nothing else is needed.

## 4. Environment

```bash
cp .env.example .env.local   # onboard.sh does this if the file is missing
```

Fill in `.env.local` (never commit it, never paste it into chat or an issue):

| Variable                               | Needed for                                                           |
| -------------------------------------- | -------------------------------------------------------------------- |
| `DATABASE_URL`                         | **Required.** Pooler string (6543, `?pgbouncer=true`) — app runtime. |
| `DIRECT_URL`                           | Direct string (5432) — Prisma CLI / migrations only.                 |
| `NEXT_PUBLIC_SUPABASE_URL`             | Sign-in and saved progress.                                          |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Sign-in and saved progress.                                          |
| `SUPABASE_SECRET_KEY`                  | Server-side admin auth calls only.                                   |
| `NEXT_PUBLIC_APP_URL`                  | `http://localhost:3000`.                                             |

Everything else in `.env.example` (Sentry, PostHog, Slack, `CRON_SECRET`,
`ADMIN_EMAIL_DOMAINS`) is optional and no-ops when empty. **Not needed:**
`RESEND_API_KEY` and `OPEN_ROUTER_API_KEY` — no code reads them yet
(email is Supabase's own; OpenRouter arrives with M7), so they are
deliberately not in `.env.example`.

## 5. Create the schema in your database

Only against **your own** project's database:

```bash
pnpm exec prisma migrate deploy   # applies the committed migrations, in order
pnpm db:run-once                  # applies prisma/run-once.sql (currently a no-op)
```

Do **not** run `prisma migrate dev` or `migrate reset`, and never hand-edit
`prisma/schema/migrations/` — CI generates migrations
(`docs/rules/migrations.md`). `migrate deploy` only applies what is already
committed.

## 6. Run and verify

```bash
pnpm dev                       # http://localhost:3000
curl localhost:3000/api/health
```

Then in the browser: home page → open a problem → Run (Pyodide loads from
`/pyodide/…`, not a CDN) → a failing test offers a step-through replay →
sign up at `/login` → you land on `/progress`, where attempts and
statistics appear after you run code while signed in.

Before pushing any change: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`
(or `/local-review`).

## Optional: Google and GitHub sign-in

The buttons are hidden until you switch them on, so email sign-in works
without any of this (`specs/features/oauth-sign-in.md`).

1. Create the OAuth apps. The callback URL to give each provider is Supabase's,
   not the app's: `https://<project-ref>.supabase.co/auth/v1/callback` for a
   hosted project, `http://127.0.0.1:54321/auth/v1/callback` for local Supabase.
   - **GitHub:** github.com → Settings → Developer settings → OAuth Apps → New.
   - **Google:** console.cloud.google.com → APIs & Services → Credentials →
     Create credentials → OAuth client ID (Web application).
2. Give Supabase the client ID and secret: **Authentication → Providers** in the
   dashboard, or for local Supabase `[auth.external.github]` /
   `[auth.external.google]` in `supabase/config.toml` with
   `secret = "env(SUPABASE_AUTH_EXTERNAL_GITHUB_SECRET)"`. Never put them in
   this repo.
3. In Supabase **Authentication → URL Configuration**, add
   `http://localhost:3000/api/auth/callback` to the Redirect URLs.
4. Set `AUTH_GITHUB_ENABLED="true"` and/or `AUTH_GOOGLE_ENABLED="true"` in
   `.env.local` and restart `pnpm dev`.

## Known limitations

- Without Supabase variables the site still runs and you can practise
  signed-out, but there is no sign-in or saved progress.
- Pass/fail is client-reported telemetry (ADR-0001), not server-verified.
- Resend and OpenRouter/AI recommendations are not integrated yet (M7).
- Sentry/PostHog stay silent locally unless you set their keys.

## Troubleshooting

- **Boot fails with an env message**: `DATABASE_URL` is missing or not a URL.
- **`migrate deploy` hangs**: you used the pooler (6543) as `DIRECT_URL`; it
  needs the direct string (5432).
- **Sign-up says "Check your email"**: "Confirm email" is still on in
  Supabase; disable it, or confirm via the emailed link.
- **Sign-in works but `/progress` errors**: migrations were not applied to
  the database `DATABASE_URL` points at.
- **Run button hangs / 404 on `/pyodide/…`**: run `node scripts/copy-pyodide.mjs`.
- **Tests refuse to load**: Node is older than 22.18.
