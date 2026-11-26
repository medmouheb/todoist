-- Importance points (0–100) from the comparison matrix; null until the task has been compared.
ALTER TABLE tasks ADD COLUMN importance SMALLINT CHECK (importance BETWEEN 0 AND 100);
