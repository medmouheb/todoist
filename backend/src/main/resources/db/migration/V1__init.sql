CREATE TABLE users (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email         VARCHAR(255) NOT NULL UNIQUE,
    name          VARCHAR(120) NOT NULL,
    password_hash VARCHAR(100) NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE projects (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_id   BIGINT       NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name       VARCHAR(120) NOT NULL,
    color      VARCHAR(20)  NOT NULL DEFAULT 'charcoal',
    favorite   BOOLEAN      NOT NULL DEFAULT FALSE,
    inbox      BOOLEAN      NOT NULL DEFAULT FALSE,
    position   INT          NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_projects_owner ON projects (owner_id);
-- One Inbox per user.
CREATE UNIQUE INDEX uq_projects_inbox ON projects (owner_id) WHERE inbox;

CREATE TABLE tasks (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_id     BIGINT        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    project_id   BIGINT        NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    title        VARCHAR(500)  NOT NULL,
    description  TEXT,
    priority     SMALLINT      NOT NULL DEFAULT 4 CHECK (priority BETWEEN 1 AND 4),
    due_date     DATE,
    completed    BOOLEAN       NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    position     INT           NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_tasks_owner_due ON tasks (owner_id, completed, due_date);
CREATE INDEX idx_tasks_project ON tasks (project_id, completed);
