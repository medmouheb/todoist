-- Categories form a tree under an implicit "Todos" root; tasks have an order inside their category,
-- a last-modified time, and conditions that must hold before they can be done.

-- A category without a parent sits directly under "Todos". position is the order among siblings.
ALTER TABLE categories ADD COLUMN parent_id BIGINT REFERENCES categories (id) ON DELETE CASCADE;
CREATE INDEX idx_categories_parent ON categories (owner_id, parent_id, position);

-- Every move and rename of a category, newest first.
CREATE TABLE category_history (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    category_id BIGINT       NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
    action      VARCHAR(20)  NOT NULL, -- CREATED, MOVED, RENAMED
    from_value  VARCHAR(200),
    to_value    VARCHAR(200),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_category_history ON category_history (category_id, id DESC);

-- Order of a task inside its category (the tree viewer's "by category" order).
ALTER TABLE tasks ADD COLUMN category_position INT NOT NULL DEFAULT 0;
UPDATE tasks SET category_position = position;

-- Last time anything about the task changed.
ALTER TABLE tasks ADD COLUMN updated_at TIMESTAMPTZ;
UPDATE tasks SET updated_at = coalesce(completed_at, created_at);
ALTER TABLE tasks ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE tasks ALTER COLUMN updated_at SET DEFAULT now();

-- Conditions of doing:
--   AFTER  another task must be completed first (after_task_id)
--   TIME   only between start_time and end_time
--   PLACE  at a location (value)
--   PERSON with or around someone (value)
--   STATE  any other state, like "healthy" or "rested" (value)
CREATE TABLE task_conditions (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    task_id       BIGINT       NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    type          VARCHAR(10)  NOT NULL,
    value         VARCHAR(120),
    after_task_id BIGINT       REFERENCES tasks (id) ON DELETE CASCADE,
    start_time    TIME,
    end_time      TIME,
    position      INT          NOT NULL DEFAULT 0
);
CREATE INDEX idx_task_conditions_task ON task_conditions (task_id, position);
CREATE INDEX idx_task_conditions_after ON task_conditions (after_task_id) WHERE after_task_id IS NOT NULL;
