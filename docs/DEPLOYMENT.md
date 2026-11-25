# Deploying COURTSIDE IQ

## Topology

| Service | Image | Notes |
|---|---|---|
| `db` | `pgvector/pgvector:pg16` | PostgreSQL 16 with the `vector` extension (created by the first migration). |
| `redis` | `redis:7` | Provider response cache. Optional: the app falls back to an in-process cache. |
| `api` | `backend/Dockerfile` | Runs `alembic upgrade head`, then `uvicorn`. Set `ENABLE_SCHEDULER=false` when a separate worker runs. |
| `worker` | `backend/Dockerfile` | `python -m app.scheduler`: live polling, odds snapshots, forecast freezing, settlement. Run **exactly one**. |
| `web` | `frontend/Dockerfile` | Next.js standalone server; proxies `/api/*` to `BACKEND_URL`. |

`docker compose up --build` starts the whole stack locally. For production, run the same images on your orchestrator (ECS, Cloud Run, Kubernetes, Fly):

1. **Database**: a managed Postgres 15+ with pgvector (RDS, Cloud SQL, Neon and Supabase all support it). Set `DATABASE_URL=postgresql+psycopg://…`.
2. **Secrets**: no key is needed for ESPN data. Keep `BALLDONTLIE_API_KEY`, `ODDS_API_KEY`, `ANTHROPIC_API_KEY`, `ADMIN_TOKEN` and `POSTGRES_PASSWORD` in your secret manager and inject them as env vars into `api` and `worker` only. The web container needs none.
3. **Migrations**: run automatically on `api` start; for a dedicated release step, run `alembic upgrade head`.
4. **Persistent volumes**: `artifacts/` (trained model files referenced by `model_versions.artifact_path`) and `data/raw/` (original import files). On ephemeral platforms, mount object storage or a shared volume.
5. **CORS / origin**: the web app proxies the API, so browsers only talk to one origin. If you expose the API directly, set `CORS_ORIGINS`, and `NEXT_PUBLIC_API_URL` at web build time.
6. **SSE**: `/api/stream/ticker` is a long-lived response. Disable proxy buffering (the API sends `X-Accel-Buffering: no`) and allow idle timeouts above 60s. The frontend falls back to 20s polling automatically.
7. **Scaling**: the API is stateless apart from an in-process feature cache; scale it horizontally. Keep one worker so forecasts aren't frozen twice.

## Data

With the default `DATA_SOURCE=espn`, the first start restores the committed real-data snapshot
(`backend/data/espn_snapshot`, see [DATA.md](DATA.md)) into an empty database and then brings it
up to date from ESPN's public API: results and box scores since the snapshot, the next seven days
of schedule with DraftKings lines, the NBA injury report and NBA rosters. Without a snapshot it
loads the configured number of seasons from ESPN (about 12,000 requests; responses for past days
are cached in `backend/data/espn_cache`). The scheduler then refreshes scores and lines every
`ESPN_POLL_SECONDS`, the schedule hourly, injuries every 30 minutes and rosters every six hours.

The Odds API (`ODDS_API_KEY`) adds player prop lines, first-half and team totals and more
sportsbooks on top of the ESPN feed.

`DATA_SOURCE=demo` runs on the synthetic dataset in `backend/data/demo_snapshot` instead
(`USE_DEMO_SNAPSHOT=false` regenerates it with the simulator). The test suite uses this mode.

## Observability

- Structured JSON logs on stdout, with `X-Response-Time-ms` on every response.
- `/api/health` for liveness, `/api/status` for mode, provider health, data freshness and active model versions.
- `provider_health` table: latency, errors and remaining request quota per provider call.
- `/api/data/quality`: integrity checks, including predictions with data timestamps after tip-off (should always be 0).

## Backups

Back up the Postgres database (predictions, settlements and picks are the irreplaceable records) and the `artifacts/` volume. Raw import files in `data/raw/` are content-addressed by SHA-256.

## Static site (GitHub Pages)

`.github/workflows/pages.yml` publishes the site on every push to `main` and every two hours:

1. `python -m app.cli bootstrap` restores the real-data snapshot into SQLite, syncs everything
   since then from ESPN (the response cache is kept between runs with `actions/cache`), trains the
   models, runs the walk-forward backtest for the current season and freezes forecasts for
   upcoming games.
2. `python -m app.cli export-static` renders every API response the web app uses into
   `frontend/public/data` (file names are defined by `static_key`, mirrored by `staticKey` in
   `frontend/lib/api.ts`).
3. The frontend is built with `STATIC_EXPORT=1` (Next.js static export) and pushed to the
   `gh-pages` branch.

Between builds, the browser refreshes the score, period and clock of games in progress directly
from ESPN's public scoreboard (`frontend/lib/espn-live.ts`). Forecasts stay as they were frozen
before tip-off.

GitHub Pages serves the `gh-pages` branch (Settings, Pages, Build and deployment: "Deploy from a branch", `gh-pages`, `/ (root)`).

To refresh the committed snapshot:

```bash
cd backend
python -m app.cli bootstrap
python -m app.cli export-snapshot      # writes backend/data/espn_snapshot
```
