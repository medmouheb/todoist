-- Categories, deadlines, reminders, per-person project order and the change history.

-- The person's time zone, so "15:00" reminders fire at their 15:00.
ALTER TABLE users ADD COLUMN time_zone VARCHAR(64) NOT NULL DEFAULT 'UTC';

-- Each person orders their own sidebar.
ALTER TABLE project_members ADD COLUMN position INT NOT NULL DEFAULT 0;
UPDATE project_members m SET position = p.position FROM projects p WHERE p.id = m.project_id;

-- Categories belong to the person who made them; anyone who can see a task sees its category.
CREATE TABLE categories (
    id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_id BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name     VARCHAR(60) NOT NULL,
    color    VARCHAR(20) NOT NULL DEFAULT 'slate',
    position INT         NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX uq_categories_owner_name ON categories (owner_id, lower(name));

ALTER TABLE tasks
    ADD COLUMN category_id        BIGINT REFERENCES categories (id) ON DELETE SET NULL,
    -- A hard deadline, separate from the planned due date.
    ADD COLUMN deadline           TIMESTAMPTZ,
    -- When each automatic notification went out, so each is sent once.
    ADD COLUMN reminder_sent_at   TIMESTAMPTZ,
    ADD COLUMN deadline_warned_at TIMESTAMPTZ,
    ADD COLUMN deadline_missed_at TIMESTAMPTZ;
CREATE INDEX idx_tasks_category ON tasks (category_id) WHERE category_id IS NOT NULL;
CREATE INDEX idx_tasks_deadline ON tasks (deadline) WHERE deadline IS NOT NULL AND NOT completed AND deleted_at IS NULL;
CREATE INDEX idx_tasks_project_order ON tasks (project_id, parent_id, position);

-- History: one row per change, holding only the fields that changed ({"title": ["old", "new"]}).
-- Quick edits in a row by the same person on the same task are merged into one row.
CREATE TABLE activities (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id BIGINT       NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    task_id    BIGINT       REFERENCES tasks (id) ON DELETE SET NULL,
    task_title VARCHAR(500),
    actor_id   BIGINT       REFERENCES users (id) ON DELETE SET NULL,
    action     VARCHAR(30)  NOT NULL,
    changes    JSONB,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
-- History is read newest first, by project or by task, a page at a time (keyset on id).
CREATE INDEX idx_activities_project ON activities (project_id, id DESC);
CREATE INDEX idx_activities_task ON activities (task_id, id DESC) WHERE task_id IS NOT NULL;

-- Notifications are read newest first and merged by (user, actor, task) for live activity.
CREATE INDEX idx_notifications_merge ON notifications (user_id, actor_id, task_id, type) WHERE read_at IS NULL;
