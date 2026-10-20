# Doable

A task manager in the spirit of Todoist: Angular frontend, Spring Boot API, PostgreSQL database.
Everything runs in Docker. **The only thing you need installed is [Docker Desktop](https://www.docker.com/products/docker-desktop/)**: no Java, Maven, Node or PostgreSQL on your machine.

## Run it

```bash
git clone <this repo> doable && cd doable
cp .env.example .env          # optional: every setting has a working default
docker compose up --build
```

Open **http://localhost:4200** and sign up. The first build takes a few minutes while the images download dependencies; later builds are cached.

| Service    | What it is                                             | Host port |
|------------|--------------------------------------------------------|-----------|
| `frontend` | Angular app served by nginx, forwards `/api` to the API | 4200      |
| `backend`  | Spring Boot 3.5 on Java 21                              | 8080      |
| `db`       | PostgreSQL 17, data kept in the `pgdata` volume         | 5432      |
| `adminer`  | Database viewer in the browser                          | 8081      |
| `mailpit`  | Catches every email the app sends (reset links, login links, invites) | 8025 |

Nothing is ever delivered to a real inbox: open **http://localhost:8025** to read the emails.

Stop with `Ctrl+C` or `docker compose down`. Add `-v` (`docker compose down -v`) to also delete the database.

## Working on the code

**Frontend with live reload.** Run `ng serve` inside a container instead of nginx:

```bash
docker compose -f compose.yaml -f compose.dev.yaml up --build
```

Edit anything under `frontend/src` and the browser refreshes on its own.

**Backend.** After changing Java code, rebuild just the API:

```bash
docker compose up -d --build backend
docker compose logs -f backend
```

Database changes go in a new Flyway migration, for example `backend/src/main/resources/db/migration/V3__add_sections.sql`. Never edit a migration that has already run.

**Running Angular or Maven commands** without installing anything:

```bash
# Angular CLI, e.g. generate a component
docker run --rm -it -v "$PWD/frontend:/app" -w /app node:22-alpine npx ng generate component features/foo

# Maven, e.g. run the tests
docker run --rm -it -v "$PWD/backend:/src" -w /src maven:3.9-eclipse-temurin-21 mvn test
```

**Looking at the database.** Open **http://localhost:8081** (Adminer) and log in with:

| Field    | Value        |
|----------|--------------|
| System   | PostgreSQL   |
| Server   | `db`         |
| Username | `doable`     |
| Password | `doable`     |
| Database | `doable`     |

(The last three are the `POSTGRES_*` values in `.env`.) Click a table, then **Select data**. Desktop tools such as DBeaver or pgAdmin can connect to `localhost:5432` with the same login. From a terminal: `docker compose exec db psql -U doable doable`.

**Testing the API with Postman.** Import [postman/Doable.postman_collection.json](postman/Doable.postman_collection.json) and run its folders top to bottom (or **Run collection**). **Account › Sign up** (or **Log in** after the first time) saves the token every other request uses; requests that create things save their ids for the ones after. **Collaboration** signs up a second person, Bob, to show invites, assigning, comments, notifications and guest permissions. **Clean up** deletes the test project. The base URL is the collection variable `baseUrl` (`http://localhost:8080`). For the password-reset and login-link requests, copy the token from the email in Mailpit.

To run the whole collection without Postman:

```bash
docker run --rm --network doable_default -v "$PWD/postman:/etc/newman" postman/newman:6-alpine \
  run Doable.postman_collection.json --env-var baseUrl=http://backend:8080 --env-var email=me$RANDOM@example.com
```

## What's in version 0.2

Built from the [feature review](https://claude.ai/artifact/71rAh3mkEWYvSjAvesceHG) on the [Doable design system](https://claude.ai/artifact/WMQMtRTBHvESkeDXva1Y7j) tokens (colors, type, priority and date colors, light and dark).

**Account**
- Sign up, log in, forgot password (reset link by email), log in with an email link
- Settings: name, password, theme (device, light, dark), 12/24-hour time, week start, home view
- Account menu with theme switch, keyboard shortcuts, data export (JSON) and log out

**Tasks**
- Inbox, Today (Overdue first, with **Reschedule** for all overdue at once), Upcoming (week strip; drag a task onto a day to reschedule it), Completed (history by day, with Uncomplete)
- Priority P1–P4, due date with time, duration and repeat (`every weekday`, `every monday`, `every 2 weeks` …); completing a repeating task moves it to its next date
- Labels, sub-tasks (up to 4 levels, with a done/total count), comments with @mentions
- Task detail panel with every field; right-click menu (date, priority, move, delete)
- Undo after complete, delete, move and reschedule; designed confirm dialogs
- Quick add from anywhere with **Q**. Shortcuts in the name fill the fields:
  `Call landlord tomorrow 3pm p1 #Home @phone every monday`
- Keyboard: ↑/↓ (or J/K) select, Enter open, E edit, T date, 1–4 priority, Ctrl+Enter complete, Del delete, G then I/T/U/C to navigate, ? for the full list

**Projects and collaboration**
- Projects with colors and favorites; archive, duplicate, save as a CSV template, import from CSV
- Share a project by email with a role: **Admin** (manages the project and people), **Member** (works on tasks), **Guest** (views, comments, completes tasks assigned to them). Invites work for people without an account yet.
- Assign tasks to people in the project; a project's Today and Upcoming show tasks that are yours or unassigned
- Notifications (bell, checked every 30 seconds): invites with Join/Decline, assignments, comments, mentions

Not built yet: sections, board and calendar layouts, search, saved filters, deadlines, reminders, activity log, goals, onboarding, the phone app.

## Layout

```
compose.yaml          the whole stack
compose.dev.yaml      override for frontend live reload
.env.example          settings (copy to .env)
backend/              Spring Boot API
  src/main/java/com/doable/
    auth/             sign up, log in, password reset, login links, JWT
    user/             profile, settings, data export
    project/          projects, members, roles, invites (ProjectAccess checks permissions)
    task/             tasks, views, repeat rules, sub-tasks, CSV import/export, duplicate
    label/ comment/ notification/ mail/
  src/main/resources/db/migration/   Flyway SQL migrations
frontend/             Angular 20 app
  src/app/core/       API client, auth, dates, repeat rules, quick-add parser, shared state, task actions with Undo
  src/app/shared/     date picker, dropdown menu
  src/app/features/   auth, shell (sidebar, notifications), task list, task row, editor, detail panel,
                      completed, invites, dialogs (share, project, settings, shortcuts, confirm)
  nginx.conf          serves the build and proxies /api
postman/              API collection
```

## API

Everything except `/api/auth/*` needs `Authorization: Bearer <token>`. Errors come back as JSON with a readable `detail`. The Postman collection has a working example of every call.

| Method | Path | Notes |
|--------|------|-------|
| POST | `/api/auth/signup`, `/api/auth/login` | → `{token, user}` |
| POST | `/api/auth/forgot-password`, `/api/auth/login-link` | `{email}`; always 202, the link goes by email |
| POST | `/api/auth/reset-password`, `/api/auth/login-link/verify` | `{token, password}` / `{token}` → `{token, user}` |
| GET, PUT | `/api/me` | profile and settings |
| PUT | `/api/me/password` | `{currentPassword, newPassword}` |
| GET | `/api/me/export` | everything as JSON |
| GET, POST | `/api/projects` | list includes your role, member count, open task count |
| GET, PUT, DELETE | `/api/projects/{id}` | PUT takes any of `name`, `color`, `favorite`, `archived` |
| POST | `/api/projects/{id}/duplicate` | |
| GET | `/api/projects/{id}/export` | CSV template |
| POST | `/api/projects/{id}/import` | CSV body (`Content-Type: text/csv`) |
| GET | `/api/projects/{id}/sharing` | members, pending invites, your role |
| POST | `/api/projects/{id}/invites` | `{email, role}`; admins only |
| DELETE | `/api/projects/{id}/invites/{inviteId}` | cancel an invite |
| PUT, DELETE | `/api/projects/{id}/members/{userId}` | change role `{role}` / remove (or leave, for yourself) |
| GET | `/api/invites` | invites waiting for you |
| POST | `/api/invites/{id}/accept`, `/decline` | |
| GET | `/api/tasks?view=today\|upcoming\|inbox&date=YYYY-MM-DD` | `date` is the user's local day |
| GET | `/api/tasks?projectId=3`, `/api/tasks?parentId=7` | a project's open tasks / a task's sub-tasks |
| GET | `/api/tasks/completed[?projectId=3]` | newest first |
| GET, PATCH, DELETE | `/api/tasks/{id}` | PATCH sends only what changes; delete can be undone |
| POST | `/api/tasks` | `title` plus any of `description, priority, dueDate, dueTime, durationMinutes, recurrence, projectId, parentId, assigneeId, labels` |
| POST | `/api/tasks/{id}/restore` | undo a delete (kept 7 days) |
| GET, POST | `/api/tasks/{id}/comments` | `{body}`; `@Name` mentions people in the project |
| DELETE | `/api/comments/{id}` | your own comments |
| GET, POST, PUT, DELETE | `/api/labels[/{id}]` | labels are also created by using them |
| GET | `/api/notifications` | `{unread, items}` |
| POST | `/api/notifications/{id}/read`, `/read-all` | |

## Putting it online

**Render + Neon (free, no server to manage):** [deploy/DEPLOY-RENDER.md](deploy/DEPLOY-RENDER.md). The root `Dockerfile` builds frontend and backend into one container (Spring Boot serves the Angular files), `render.yaml` describes the Render service, the database comes from Neon through `DATABASE_URL`, and email goes through Brevo's API (`BREVO_API_KEY`) because Render's free plan blocks SMTP. The app sleeps after 15 idle minutes and takes about a minute to wake.

**Your own server instead:** [deploy/DEPLOY.md](deploy/DEPLOY.md) walks through hosting it for free on an Oracle Cloud Always Free server: `compose.prod.yaml` runs the same containers behind Caddy (automatic HTTPS), with only ports 80 and 443 open, settings in `.env.prod` (see `.env.prod.example`), real email through an SMTP service, daily backups (`deploy/backup.sh`) and one-command updates (`deploy/update.sh`).
