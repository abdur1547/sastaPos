# Self-Hosted PowerSync (standalone)

A self-contained setup for running the **PowerSync Service** with Docker, connecting to a
**Postgres database you already run yourself** (this folder does not start Postgres).

Files in this folder:

| File                  | Purpose                                                              |
| --------------------- | --------------------------------------------------------------------- |
| `docker-compose.yaml` | Runs the `journeyapps/powersync-service` container                    |
| `.env.example`        | Template for secrets/config — copy to `.env`                          |
| `service.yaml`        | PowerSync instance config: DB connection, storage, auth, ports        |
| `sync-config.yaml`    | Sync Streams — defines *what* data gets synced to clients             |

---

## 1. How PowerSync works (short version)

```mermaid
flowchart LR
    subgraph Client Apps
        A[Mobile / Web app\nlocal SQLite via PowerSync SDK]
    end
    subgraph Your Backend
        B[Your API server\nissues JWTs + applies writes]
    end
    subgraph PowerSync Service (this folder)
        C[Replication worker\nreads Postgres WAL]
        D[Sync API server\nstreams data to clients]
        E[(Bucket storage\nPostgres/MongoDB)]
    end
    P[(Your Postgres DB)]

    A -- "1. auth (JWT)" --> B
    A <-- "2. sync data (websocket/HTTP)" --> D
    A -- "3. writes (queued offline)" --> B
    B -- "4. applies writes" --> P
    P -- "5. logical replication (WAL)" --> C
    C --> E
    D --> E
```

1. **Replication**: PowerSync connects to your Postgres like a replica, using **logical
   replication** (same mechanism used for read replicas / CDC). It never touches your schema.
2. **Sync Rules / Streams** (`sync-config.yaml`) define SQL-like queries describing which rows
   go to which clients, and group changes into "buckets".
3. **Bucket storage**: PowerSync keeps its own replicated/partitioned copy of the data (in
   Postgres or MongoDB — configured via `storage:` in `service.yaml`), which it uses to
   efficiently stream incremental changes to many clients.
4. **Client SDKs** (iOS/Android/Flutter/React Native/JS/Kotlin/Swift…) embed a local SQLite
   database in the app. They connect to the PowerSync sync API (this service) over a
   websocket/HTTP stream and keep the local DB in sync in real time — including offline support.
5. **Writes**: PowerSync is *read-replication only*. Client-side writes are queued locally by
   the SDK and your app calls **your own backend API** to apply them to Postgres (PowerSync
   does not write to your database). Once written, they flow back through replication like any
   other change.
6. **Auth**: PowerSync doesn't authenticate users itself — it validates a JWT (issued by your
   own backend or auth provider) on every client connection, using a JWKS URL or static public
   key(s) configured in `client_auth`.

So self-hosting PowerSync = running this one stateless-ish service (`powersync-service`) that
sits between your Postgres and your app's PowerSync SDK.

---

## 2. Prepare your existing Postgres

Run these once against **your existing** Postgres database (adjust names as you like, `powersync`
is required for the publication name).

```sql
-- 1. Enable logical replication (requires a Postgres restart)
ALTER SYSTEM SET wal_level = logical;
-- restart Postgres after this

-- 2. Create a role for PowerSync (read-only + replication)
CREATE ROLE powersync_role WITH REPLICATION BYPASSRLS LOGIN PASSWORD 'CHANGE_ME';
GRANT SELECT ON ALL TABLES IN SCHEMA public TO powersync_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO powersync_role;

-- 3. Create the publication PowerSync replicates from (must be named "powersync")
CREATE PUBLICATION powersync FOR ALL TABLES;
-- For large DBs, replicate only specific tables instead:
-- CREATE PUBLICATION powersync FOR TABLE public.lists, public.todos;
```

Check requirements:
- Postgres **11+**.
- `SHOW wal_level;` must return `logical`.
- The `powersync_role` user also needs privileges to create/use its own schema for bucket
  storage if you point `PS_STORAGE_SOURCE_URI` at the same database (it creates a `powersync`
  schema there automatically) — the `postgres` superuser or a role with `CREATEDB`/schema
  privileges works too if you'd rather use a dedicated storage user.

---

## 3. Configure this folder

```bash
cd powersync
cp .env.example .env
```

Edit `.env`:

- `PS_DATA_SOURCE_URI` — connection string to your existing Postgres, e.g.
  `postgresql://powersync_role:CHANGE_ME@host.docker.internal:5432/your_database`
  - Use `host.docker.internal` if Postgres runs directly on your host machine (not in Docker).
    The compose file already maps this for Linux/macOS/Windows via `extra_hosts`.
  - If Postgres runs in Docker on a shared network, use its service/container name instead and
    add that network to `docker-compose.yaml`.
- `PS_STORAGE_SOURCE_URI` — where PowerSync stores its own sync state. Simplest: same Postgres,
  same database (isolated automatically in a `powersync` schema). For production, prefer a
  separate database/instance so replication storage I/O doesn't compete with your app.
- `PS_JWKS_URL` — JWKS endpoint of whatever issues your app's JWTs. See [Authentication](#5-authentication) below if you don't have one yet.
- `PS_API_TOKEN` — random secret for PowerSync's own admin routes: `openssl rand -hex 32`.

Edit `sync-config.yaml` to describe your real tables (replace `your_table_name`). Every table
referenced here must be included in the `powersync` publication created above.

---

## 4. Run it

### Local development

```bash
cd powersync
docker compose up -d
docker compose logs -f powersync
```

- API/sync endpoint: `http://localhost:8080` (or whatever `PS_PORT` you set).
- Health check: `http://localhost:8080/probes/liveness`
- Stop: `docker compose down` (add `-v` to also wipe any local volumes, though this setup has none
  since Postgres lives outside this compose file).

After changing `sync-config.yaml`, restart the container to pick up changes:

```bash
docker compose restart powersync
```

### Production

1. **Don't use `sslmode: disable`** — set `sslmode: verify-ca` or `verify-full` in `service.yaml`
   for both `replication.connections` and `storage`, and supply `cacert` (and client cert/key if
   your Postgres requires mTLS) via env vars.
2. **Split services** for independent scaling/restarts instead of the unified container:
   ```yaml
   # API/sync server (scale this horizontally behind a load balancer)
   command: ["start", "-r", "api"]
   # Replication worker (run exactly ONE instance of this)
   command: ["start", "-r", "sync"]
   ```
3. **Put a reverse proxy / TLS terminator** (nginx, Caddy, your cloud LB) in front of the API
   service; PowerSync itself serves plain HTTP.
4. **Set `NODE_OPTIONS=--max-old-space-size`** to ~80% of the container memory limit.
5. **Use real secrets management** for `.env` values (Docker secrets, Vault, cloud secret
   manager) rather than a plain `.env` file on disk.
6. **Size storage separately** — under real load, use a dedicated Postgres (or MongoDB) instance
   for `storage`, not the same instance serving your application traffic.
7. **Set a strong, unique `PS_API_TOKEN`** and don't expose the admin API publicly.
8. **Monitor replication lag** and container health via `/probes/liveness` and PowerSync's logs
   (`system.logging` in `service.yaml`, set `format: json` for log aggregation).
9. PowerSync also publishes official guides for deploying on **Coolify, Railway, AWS ECS, AWS
   EKS** — see the docs link below.

---

## 5. Authentication

PowerSync never creates users or passwords — it just validates a JWT your backend issues on each
client connection request (the `sub`/user id claim is what scopes per-user data in your sync
rules).

If you don't yet have an auth backend issuing PowerSync-compatible JWTs, this repo includes a
`key-generator` tool (at `../key-generator`) that creates an RSA keypair you can use for local
testing:

```bash
cd ../key-generator
pnpm install
pnpm start
```

It prints a public JWK (paste into `service.yaml` under `client_auth.jwks.keys`, and remove/ignore
`jwks_uri`) and a base64 private key your own backend uses to sign JWTs for connecting clients.
This is only meant to get you unblocked locally — in production, prefer real auth integration
(Supabase Auth, Auth0, Firebase Auth, or your own OAuth/JWT issuer) and use `jwks_uri`.

---

## 6. Useful links

- Self-hosting overview: https://docs.powersync.com/self-hosting/getting-started
- Postgres source setup (all providers): https://docs.powersync.com/installation/database-setup
- Self-hosted instance configuration reference: https://docs.powersync.com/configuration/powersync-service/self-hosted-instances
- Sync Streams: https://docs.powersync.com/sync/streams/overview
- Client SDKs: https://docs.powersync.com/client-sdk-references/introduction
- Deployment guides (Coolify/Railway/AWS ECS/EKS): https://docs.powersync.com/maintenance-ops/self-hosting/overview
