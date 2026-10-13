package com.doable.task;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;

public final class TaskDtos {

    private TaskDtos() {
    }

    /** projectId may be null: the task then goes to the Inbox. */
    public record CreateTaskRequest(
            @NotBlank @Size(max = 500) String title,
            @Size(max = 10_000) String description,
            @Min(1) @Max(4) Short priority,
            LocalDate dueDate,
            Long projectId) {
    }

    /** Every field is optional; only the ones sent are changed. clearDueDate removes the date. */
    public record UpdateTaskRequest(
            @Size(min = 1, max = 500) String title,
            @Size(max = 10_000) String description,
            @Min(1) @Max(4) Short priority,
            LocalDate dueDate,
            Boolean clearDueDate,
            Long projectId,
            Boolean completed) {
    }

    public record TaskResponse(Long id, Long projectId, String title, String description, short priority,
                               LocalDate dueDate, boolean completed, Instant completedAt, int position,
                               Instant createdAt) {
        static TaskResponse of(Task t) {
            return new TaskResponse(t.getId(), t.getProjectId(), t.getTitle(), t.getDescription(),
                    t.getPriority(), t.getDueDate(), t.isCompleted(), t.getCompletedAt(), t.getPosition(),
                    t.getCreatedAt());
        }
    }
}
