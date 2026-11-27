-- The rest of the ToDo model: a state, when it can be done, why it's worth doing, a notification time,
-- and why it wasn't done when that notification went out.

-- TODO, DAILY, WEEKLY, MONTHLY, TO_FOLLOW_UP, CONDITIONAL or DELETED (set when the task is deleted).
ALTER TABLE tasks ADD COLUMN state VARCHAR(20) NOT NULL DEFAULT 'TODO';
-- ALL_TIMES, WORKING_HOURS or ONLY_WEEKENDS.
ALTER TABLE tasks ADD COLUMN possible_times VARCHAR(20) NOT NULL DEFAULT 'ALL_TIMES';
UPDATE tasks SET state = 'DELETED' WHERE deleted_at IS NOT NULL;

-- Reason to do it: money gained, hours gained per year, and how much it matters emotionally (0–10).
ALTER TABLE tasks ADD COLUMN reason_money DOUBLE PRECISION;
ALTER TABLE tasks ADD COLUMN reason_hours_per_year DOUBLE PRECISION;
ALTER TABLE tasks ADD COLUMN reason_emotional SMALLINT CHECK (reason_emotional BETWEEN 0 AND 10);

-- A notification at a chosen moment; notified_at is when it went out (cleared when the time changes).
ALTER TABLE tasks ADD COLUMN notification_time TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN notified_at TIMESTAMPTZ;
CREATE INDEX idx_tasks_notification ON tasks (notification_time)
    WHERE notification_time IS NOT NULL AND notified_at IS NULL AND completed = false AND deleted_at IS NULL;

-- Why the task wasn't done when it was notified. reasons holds one reason per line.
CREATE TABLE task_not_done (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    task_id           BIGINT      NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    notification_time TIMESTAMPTZ NOT NULL,
    reasons           TEXT        NOT NULL,
    created_by        BIGINT      NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_task_not_done_task ON task_not_done (task_id, id);
