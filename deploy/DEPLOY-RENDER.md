# Deploying Doable on Render + Neon (free)

The app runs on [Render](https://render.com) as one free web service (frontend and backend in one container, built from `/Dockerfile`), with the database on [Neon](https://neon.tech)'s free PostgreSQL. Email goes through [Brevo](https://www.brevo.com)'s free plan. No server to look after, and nothing to install. Plan on about 30 minutes.

**What free means here**

- The app **sleeps after 15 minutes without visitors**. The next visit waits about a minute while it starts again; after that it's fast.
- Neon's free database is 0.5 GB, plenty for thousands of tasks. It also pauses when idle and wakes in about a second.
- Render's free plan **blocks normal email (SMTP)**, so the app sends email through Brevo's web API instead. That's already built in.
- Your address will look like `https://doable-xxxx.onrender.com`. You can add your own domain later in Render's settings.

## Before you start

Your latest code must be on GitHub (`medmouheb/todoist`), because Render builds from there. Commit and push first.

## 1. Create the database on Neon

1. Sign up at <https://neon.tech> (no card needed). A GitHub login works.
2. Create a project. Name it `doable` and choose the region **AWS US East 2 (Ohio)**: the app runs in Render's Ohio region (set in `render.yaml`), and keeping both together makes every request faster. If you pick another Neon region, change `region` in `render.yaml` to the nearest Render region.
3. On the project dashboard, click **Connect**. Turn **Connection pooling off**: the app manages its own connections, and database migrations need a direct connection. (A pooled string has `-pooler` in its host name; removing `-pooler` gives the direct one.)
4. Copy the connection string. It looks like:

   ```
   postgresql://neondb_owner:AbC123xyz@ep-cool-name-123456.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```

   Keep it private: it contains the database password.

## 2. Set up email on Brevo (needed for sign-up)

New accounts confirm their email with a code, so new people can't sign up without this. To let testers in before Brevo is ready, set `REQUIRE_EMAIL_VERIFICATION` to `false` in the Render service's **Environment** (and back to `true` once email works). Accounts that already existed are not affected.

1. Sign up at <https://www.brevo.com> (free plan: 300 emails a day).
2. **Senders, domains & dedicated IPs → Senders → Add a sender**, using the address emails should come from, then confirm it from your inbox.
3. **SMTP & API → API Keys → Generate a new API key**. Copy it (it starts with `xkeysib-`).

## 3. Create the app on Render

1. Sign up at <https://render.com> with your GitHub account, and allow it to see the `todoist` repository.
2. Click **New → Blueprint**, pick the `medmouheb/todoist` repository, and give the blueprint a name. Render reads `render.yaml` from the repository and shows one free web service called `doable`.
3. It asks for the values that aren't in the file:

   | Setting | Value |
   |---|---|
   | `DATABASE_URL` | the Neon connection string from step 1 |
   | `BREVO_API_KEY` | the key from step 2 (leave empty to skip email) |
   | `MAIL_FROM` | the sender you verified, as `Doable <you@yourmail.com>` (leave empty to skip email) |

   `JWT_SECRET` (the key that signs logins) is generated for you.

4. Click **Apply**. The first build takes about 10 minutes; follow it under the service's **Events** and **Logs**.
5. When it says **Live**, open the address at the top of the service page (`https://doable-xxxx.onrender.com`) and sign up.

## Updating the app

Push to GitHub. Render rebuilds and redeploys on its own (`autoDeploy` in `render.yaml`). Database changes run automatically when the new version starts (Flyway migrations).

## Moving your local data over (optional)

To copy what's in your local database to Neon, with the local stack running, run this in PowerShell from the project folder, pasting your Neon connection string:

```powershell
docker compose exec -T db pg_dump -U doable --no-owner --no-privileges doable | docker run -i --rm postgres:18-alpine psql "PASTE_NEON_CONNECTION_STRING"
```

Do this **before** the first deploy, while the Neon database is still empty. Otherwise the tables already exist and the import fails.

## Backups

Neon keeps a short history you can restore from (**Restore** in the Neon dashboard; the free plan keeps about a day). For your own copy, run this now and then:

```powershell
docker run --rm postgres:18-alpine pg_dump "PASTE_NEON_CONNECTION_STRING" > doable-backup.sql
```

## If something goes wrong

| Problem | Check |
|---|---|
| Build fails | Render **Logs** for the deploy. The same image builds locally with `docker build -t doable .` |
| "Application failed to respond" or a long wait | It was asleep; the first visit after 15 idle minutes takes about a minute |
| Starts, then stops with a database error | `DATABASE_URL` is wrong, or pooling was on. Copy the string again from Neon with pooling off |
| Emails don't arrive | Render **Logs**, search for `Brevo`. A `401` means a wrong API key; a sender error means `MAIL_FROM` isn't a verified sender |
| Links in emails point to the wrong address | Set `APP_URL` in the service's **Environment** (for example your own domain). By default it's the Render address |

## Keeping it awake (optional)

To skip the one-minute wait, a free uptime monitor (for example UptimeRobot) can visit `https://doable-xxxx.onrender.com/actuator/health/liveness` every 10 minutes. That address doesn't touch the database, so Neon still sleeps. One always-on service uses about 744 of the 750 free hours Render gives each month, so this only works with a single free service.
