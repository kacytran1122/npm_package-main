# Deploying Selakata

Self-hosting guide for the server and dashboard. If you only use the SDK, you do not need any of this.

## What you need

- A VM with Docker and the Compose plugin
- A domain pointing at it
- A [Gemini API key](https://aistudio.google.com/apikey), only if you want AI drafts

## First deploy

```bash
git clone https://github.com/kacytran1122/npm_package-main.git selakata
cd selakata

cp .env.example .env
nano .env
```

Two values must not be left alone:

```bash
# 32+ characters. The server refuses to boot on anything shorter.
openssl rand -hex 32

# And a real MongoDB password. deploy.sh refuses to run with `changeme`.
openssl rand -hex 16
```

Then:

```bash
chmod +x deploy.sh
./deploy.sh
```

The script builds the images, starts the stack, and polls `/api/v1/health` until the API answers. Dashboard on port 80, API under `/api/v1`.

The documentation site is not part of that stack. It is static, has no backend, and sits behind a compose profile so `deploy.sh` starts exactly what it always did:

```bash
docker compose -f docker-compose.prod.yml --profile site up -d site
# http://localhost:8080, or set SITE_PORT
```

## TLS

The stack serves plain HTTP. Terminate TLS in front of it. Caddy is the shortest path:

```caddyfile
selakata.example.com {
    reverse_proxy localhost:80
}
```

Caddy handles certificates automatically. With nginx or Traefik, proxy to `localhost:80` and use certbot.

Once TLS is on, lock down CORS in `.env`:

```bash
CORS_ORIGIN=https://selakata.example.com
```

Leaving `*` means any site can call your API with a stolen token.

## Backups

Everything lives in the `mongo-data` volume.

```bash
# Back up
docker compose -f docker-compose.prod.yml exec -T mongo \
  mongodump --archive --gzip \
  --username root --password "$MONGO_ROOT_PASSWORD" --authenticationDatabase admin \
  > "backup-$(date +%F).gz"

# Restore
docker compose -f docker-compose.prod.yml exec -T mongo \
  mongorestore --archive --gzip --drop \
  --username root --password "$MONGO_ROOT_PASSWORD" --authenticationDatabase admin \
  < backup-2026-08-18.gz
```

Put the dump on a cron job and ship it off the box. A backup on the same VM is not a backup.

## Upgrading

```bash
git pull
./deploy.sh
```

Compose recreates changed containers only. The Mongo volume is untouched.

## Health and logs

```bash
curl https://selakata.example.com/api/v1/health
docker compose -f docker-compose.prod.yml logs -f server
```

Health reports which store is active and whether AI is configured:

```json
{ "ok": true, "store": "mongodb", "ai": "gemini", "locales": 29 }
```

If `store` says `memory` in production, `MONGO_CONNECTION_URL` did not reach the container and **your data is not being persisted**. Stop and fix it.

## Running without AI

Leave `GEMINI_API_KEY` empty. Everything works except drafting, and the draft endpoint returns `503` with an explanation rather than failing silently.

## Vertex AI instead of an API key

For teams that must keep inference inside their own GCP project:

```bash
GEMINI_USE_VERTEX=true
GOOGLE_CLOUD_PROJECT=my-project
GOOGLE_CLOUD_LOCATION=us-central1
GOOGLE_APPLICATION_CREDENTIALS=/secrets/sa.json
```

Mount the service account file into the server container and grant it `roles/aiplatform.user`.

## Scaling notes

The API is stateless, so you can run several replicas behind a load balancer. Two things to know:

- **Bundle reads dominate traffic.** `/api/v1/bundle` is the only endpoint end users hit, it already sends `Cache-Control`, and it is the right thing to put behind a CDN.
- **JWTs are not revocable.** Signing is stateless, so a leaked token stays valid until it expires. Shorten `JWT_EXPIRY` if that matters. Project API keys *can* be revoked instantly with `rotate-key`.

## Troubleshooting

**Server exits immediately with a JWT_SECRET error.** Working as intended. The secret is missing or under 32 characters.

**`deploy.sh` refuses to start.** Either `JWT_SECRET` is too short or `MONGO_ROOT_PASSWORD` is still `changeme`.

**Dashboard loads but every request 401s.** The API is unreachable behind nginx. Check `docker compose logs server` and confirm both containers are on the same network.

**Burmese renders as gibberish.** That is Zawgyi. Run the value through `normalizeMyanmar()`, and add `assertUnicodeMyanmar()` to your import path so it cannot happen again.
