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

Database changes go in a new Flyway migration, for example `backend/src/main/resources/db/migration/V2__add_labels.sql`. Never edit a migration that has already run.

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

**Testing the API with Postman.** Import [postman/Doable.postman_collection.json](postman/Doable.postman_collection.json). Run **Auth › Sign up** once (or **Log in** after that); the token is saved and every other request uses it. **Create project** and **Create task** save their ids for the requests that follow, and **Clean up** deletes them. The base URL is the collection variable `baseUrl` (`http://localhost:8080`).

To run the whole collection without Postman:

```bash
docker run --rm --network doable_default -v "$PWD/postman:/etc/newman" postman/newman:6-alpine \
  run Doable.postman_collection.json --env-var baseUrl=http://backend:8080 --env-var email=me$RANDOM@example.com
```

## What's in version 0.1

This is the core of the design from the [feature review](https://claude.ai/artifact/71rAh3mkEWYvSjAvesceHG), built on the [Doable design system](https://claude.ai/artifact/WMQMtRTBHvESkeDXva1Y7j) tokens (colors, type, priority and date colors, light and dark):

- Sign up and log in (email and password, JWT)
- Inbox, Today (with Overdue) and Upcoming (grouped by day)
- Projects with colors and favorites; the Inbox is created for every new account
- Tasks with description, priority P1–P4 and due date; complete with Undo; edit inline; delete
- Quick add from anywhere with the **Q** key, with shortcuts in the task name:
  `Call landlord tomorrow p1 #Home` sets the date, priority and project
- Phone-width layout with a slide-out sidebar

Not built yet (waiting on the version 1 decisions in the review doc): sections, sub-tasks, labels, comments, reminders, recurring dates, board and calendar layouts, search, sharing, notifications, goals.

## Layout

```
compose.yaml          the whole stack
compose.dev.yaml      override for frontend live reload
.env.example          settings (copy to .env)
backend/              Spring Boot API
  src/main/java/com/doable/
    auth/             sign up, log in, JWT issue
    config/           security and JWT settings
    project/          projects API
    task/             tasks API and views (inbox, today, upcoming)
  src/main/resources/db/migration/   Flyway SQL migrations
frontend/             Angular 20 app
  src/app/core/       API client, auth, dates, quick-add parser, shared state
  src/app/features/   auth page, shell (sidebar), task list, task row, task editor
  nginx.conf          serves the build and proxies /api
```

## API

All endpoints except sign up and log in need `Authorization: Bearer <token>`.

| Method | Path                                   | Notes                                    |
|--------|----------------------------------------|------------------------------------------|
| POST   | `/api/auth/signup`                     | `{name, email, password}` → `{token, user}` |
| POST   | `/api/auth/login`                      | `{email, password}` → `{token, user}`    |
| GET    | `/api/auth/me`                         |                                          |
| GET    | `/api/projects`                        | includes open task counts                |
| POST   | `/api/projects`                        | `{name, color, favorite}`                |
| PUT    | `/api/projects/{id}`                   |                                          |
| DELETE | `/api/projects/{id}`                   | deletes its tasks; the Inbox can't be deleted |
| GET    | `/api/tasks?view=today&date=2026-10-13` | `view` = `inbox`, `today` or `upcoming`; `date` is the user's local day |
| GET    | `/api/tasks?projectId=3`               | add `&completed=true` for finished tasks |
| POST   | `/api/tasks`                           | `{title, description, priority, dueDate, projectId}`; no project → Inbox |
| PATCH  | `/api/tasks/{id}`                      | any of the fields, plus `completed`, `clearDueDate` |
| DELETE | `/api/tasks/{id}`                      |                                          |

## Before deploying anywhere

Set a long random `JWT_SECRET` and a real `POSTGRES_PASSWORD` in `.env`, and don't publish the database port.
