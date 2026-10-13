-- Collaboration: projects have members with roles; tasks can be assigned, commented on and nested.

-- User settings
ALTER TABLE users
    ADD COLUMN theme       VARCHAR(10) NOT NULL DEFAULT 'system',
    ADD COLUMN time_format VARCHAR(4)  NOT NULL DEFAULT '24h',
    ADD COLUMN week_start  SMALLINT    NOT NULL DEFAULT 1,
    ADD COLUMN home_view   VARCHAR(20) NOT NULL DEFAULT 'today';

-- One-time tokens for password reset and email login links (only the hash is stored)
CREATE TABLE auth_tokens (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    purpose    VARCHAR(20) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Projects: archived flag; members with roles; favorites become per member
ALTER TABLE projects ADD COLUMN archived BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE project_members (
    project_id BIGINT      NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    user_id    BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role       VARCHAR(10) NOT NULL CHECK (role IN ('ADMIN', 'MEMBER', 'GUEST')),
    favorite   BOOLEAN     NOT NULL DEFAULT FALSE,
    joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, user_id)
);
CREATE INDEX idx_members_user ON project_members (user_id);

INSERT INTO project_members (project_id, user_id, role, favorite)
SELECT id, owner_id, 'ADMIN', favorite FROM projects;

ALTER TABLE projects DROP COLUMN favorite;

CREATE TABLE project_invites (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id BIGINT       NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    email      VARCHAR(255) NOT NULL,
    role       VARCHAR(10)  NOT NULL CHECK (role IN ('ADMIN', 'MEMBER', 'GUEST')),
    invited_by BIGINT       NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_invites_project_email ON project_invites (project_id, lower(email));
CREATE INDEX idx_invites_email ON project_invites (lower(email));

-- Tasks: owner_id now means "created by"; access comes from project membership
ALTER TABLE tasks RENAME COLUMN owner_id TO created_by;
ALTER TABLE tasks
    ADD COLUMN parent_id        BIGINT REFERENCES tasks (id) ON DELETE CASCADE,
    ADD COLUMN assignee_id      BIGINT REFERENCES users (id) ON DELETE SET NULL,
    ADD COLUMN due_time         TIME,
    ADD COLUMN duration_minutes INT CHECK (duration_minutes > 0),
    ADD COLUMN recurrence       VARCHAR(40),
    ADD COLUMN deleted_at       TIMESTAMPTZ;
DROP INDEX idx_tasks_owner_due;
CREATE INDEX idx_tasks_due ON tasks (due_date) WHERE NOT completed AND deleted_at IS NULL;
CREATE INDEX idx_tasks_parent ON tasks (parent_id);

-- Labels belong to the person who made them; anyone who can see a task sees its labels
CREATE TABLE labels (
    id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_id BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name     VARCHAR(60) NOT NULL,
    color    VARCHAR(20) NOT NULL DEFAULT 'charcoal'
);
CREATE UNIQUE INDEX uq_labels_owner_name ON labels (owner_id, lower(name));

CREATE TABLE task_labels (
    task_id  BIGINT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    label_id BIGINT NOT NULL REFERENCES labels (id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, label_id)
);

CREATE TABLE comments (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    task_id    BIGINT      NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    author_id  BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    body       TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_comments_task ON comments (task_id);

CREATE TABLE notifications (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    BIGINT       NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    type       VARCHAR(20)  NOT NULL,
    actor_id   BIGINT       REFERENCES users (id) ON DELETE SET NULL,
    project_id BIGINT       REFERENCES projects (id) ON DELETE CASCADE,
    task_id    BIGINT       REFERENCES tasks (id) ON DELETE CASCADE,
    invite_id  BIGINT       REFERENCES project_invites (id) ON DELETE CASCADE,
    message    VARCHAR(500) NOT NULL,
    read_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON notifications (user_id, created_at DESC);
