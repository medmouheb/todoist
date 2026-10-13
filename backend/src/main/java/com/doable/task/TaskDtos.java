package com.doable.task;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

public final class TaskDtos {

    private TaskDtos() {
    }

    /**
     * projectId may be null: the task then goes to the Inbox (or the parent's project for a sub-task).
     * labels are names; unknown ones are created.
     */
    public record CreateTaskRequest(
            @NotBlank @Size(max = 500) String title,
            @Size(max = 10_000) String description,
            @Min(1) @Max(4) Short priority,
            LocalDate dueDate,
            LocalTime dueTime,
            @Min(1) @Max(1440) Integer durationMinutes,
            @Size(max = 40) String recurrence,
            Long projectId,
            Long parentId,
            Long assigneeId,
            List<@Size(max = 60) String> labels) {
    }

    /**
     * Every field is optional; only the ones sent are changed.
     * clearDueDate removes the date with its time, duration and repeat; clearAssignee unassigns.
     * today is the user's local date, used to move a repeating task to its next date when completed.
     */
    public record UpdateTaskRequest(
            @Size(min = 1, max = 500) String title,
            @Size(max = 10_000) String description,
            @Min(1) @Max(4) Short priority,
            LocalDate dueDate,
            LocalTime dueTime,
            Boolean clearDueTime,
            @Min(1) @Max(1440) Integer durationMinutes,
            Boolean clearDuration,
            @Size(max = 40) String recurrence,
            Boolean clearRecurrence,
            Boolean clearDueDate,
            Long projectId,
            Long assigneeId,
            Boolean clearAssignee,
            List<@Size(max = 60) String> labels,
            Boolean completed,
            LocalDate today) {
    }

    public record LabelRef(Long id, String name, String color) {
    }

    public record PersonRef(Long id, String name, String initials) {
    }

    public record TaskResponse(Long id, Long projectId, Long parentId, String title, String description,
                               short priority, LocalDate dueDate, LocalTime dueTime, Integer durationMinutes,
                               String recurrence, boolean completed, Instant completedAt, int position,
                               Instant createdAt, PersonRef createdBy, PersonRef assignee, List<LabelRef> labels,
                               int subtaskCount, int subtaskDone, int commentCount) {
    }
}
