package com.doable.task;

import com.doable.label.Label;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.LinkedHashSet;
import java.util.Set;
import org.hibernate.annotations.BatchSize;

@Entity
@Table(name = "tasks")
public class Task {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "created_by", nullable = false, updatable = false)
    private Long createdBy;

    @Column(name = "project_id", nullable = false)
    private Long projectId;

    /** Set for sub-tasks. */
    @Column(name = "parent_id")
    private Long parentId;

    @Column(name = "assignee_id")
    private Long assigneeId;

    @Column(nullable = false)
    private String title;

    @Column(columnDefinition = "text")
    private String description;

    /** 1 is the most urgent (P1), 4 is the default (no priority). */
    @Column(nullable = false)
    private short priority = 4;

    @Column(name = "due_date")
    private LocalDate dueDate;

    @Column(name = "due_time")
    private LocalTime dueTime;

    @Column(name = "duration_minutes")
    private Integer durationMinutes;

    /** One of the categories of whoever set it; shown to everyone who can see the task. */
    @Column(name = "category_id")
    private Long categoryId;

    /** A hard deadline, separate from the planned date. */
    private Instant deadline;

    // When each automatic notification went out, so it's sent once. Cleared when the date changes.
    @Column(name = "reminder_sent_at")
    private Instant reminderSentAt;
    @Column(name = "deadline_warned_at")
    private Instant deadlineWarnedAt;
    @Column(name = "deadline_missed_at")
    private Instant deadlineMissedAt;

    /** e.g. "every monday"; see {@link Recurrence}. */
    private String recurrence;

    @Column(nullable = false)
    private boolean completed;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(nullable = false)
    private int position;

    /** Deleted tasks are kept for a while so Undo can bring them back. */
    @Column(name = "deleted_at")
    private Instant deletedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    /** Last time anything about the task changed. */
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    /** 0–100 from the comparison matrix; null until compared. */
    private Short importance;

    /** Order inside its category, for the tree viewer. */
    @Column(name = "category_position", nullable = false)
    private int categoryPosition;

    /** What kind of to-do it is; DELETED is set when the task is deleted. */
    @Column(nullable = false, length = 20)
    private String state = TodoState.TODO.name();

    /** When it can be done. */
    @Column(name = "possible_times", nullable = false, length = 20)
    private String possibleTimes = PossibleTimes.ALL_TIMES.name();

    // Reason to do it.
    @Column(name = "reason_money")
    private Double reasonMoney;
    @Column(name = "reason_hours_per_year")
    private Double reasonHoursPerYear;
    /** 0–10. */
    @Column(name = "reason_emotional")
    private Short reasonEmotional;

    /** A notification at a chosen moment, and when it went out. */
    @Column(name = "notification_time")
    private Instant notificationTime;
    @Column(name = "notified_at")
    private Instant notifiedAt;

    @ManyToMany
    @JoinTable(name = "task_labels", joinColumns = @JoinColumn(name = "task_id"),
            inverseJoinColumns = @JoinColumn(name = "label_id"))
    @BatchSize(size = 100)
    private Set<Label> labels = new LinkedHashSet<>();

    protected Task() {
    }

    public Task(Long createdBy, Long projectId, String title) {
        this.createdBy = createdBy;
        this.projectId = projectId;
        this.title = title;
    }

    public void setCompleted(boolean completed) {
        this.completed = completed;
        this.completedAt = completed ? Instant.now() : null;
    }

    public Long getId() { return id; }
    public Long getCreatedBy() { return createdBy; }
    public Long getProjectId() { return projectId; }
    public void setProjectId(Long projectId) { this.projectId = projectId; }
    public Long getParentId() { return parentId; }
    public void setParentId(Long parentId) { this.parentId = parentId; }
    public Long getAssigneeId() { return assigneeId; }
    public void setAssigneeId(Long assigneeId) { this.assigneeId = assigneeId; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public short getPriority() { return priority; }
    public void setPriority(short priority) { this.priority = priority; }
    public LocalDate getDueDate() { return dueDate; }
    public void setDueDate(LocalDate dueDate) { this.dueDate = dueDate; }
    public LocalTime getDueTime() { return dueTime; }
    public void setDueTime(LocalTime dueTime) { this.dueTime = dueTime; }
    public Integer getDurationMinutes() { return durationMinutes; }
    public void setDurationMinutes(Integer durationMinutes) { this.durationMinutes = durationMinutes; }
    public String getRecurrence() { return recurrence; }
    public void setRecurrence(String recurrence) { this.recurrence = recurrence; }
    public boolean isCompleted() { return completed; }
    public Instant getCompletedAt() { return completedAt; }
    public int getPosition() { return position; }
    public void setPosition(int position) { this.position = position; }
    public Instant getDeletedAt() { return deletedAt; }
    public void setDeletedAt(Instant deletedAt) { this.deletedAt = deletedAt; }
    public Instant getCreatedAt() { return createdAt; }
    public Long getCategoryId() { return categoryId; }
    public void setCategoryId(Long categoryId) { this.categoryId = categoryId; }
    public Instant getDeadline() { return deadline; }
    public void setDeadline(Instant deadline) { this.deadline = deadline; }
    public Instant getReminderSentAt() { return reminderSentAt; }
    public void setReminderSentAt(Instant reminderSentAt) { this.reminderSentAt = reminderSentAt; }
    public Instant getDeadlineWarnedAt() { return deadlineWarnedAt; }
    public void setDeadlineWarnedAt(Instant deadlineWarnedAt) { this.deadlineWarnedAt = deadlineWarnedAt; }
    public Instant getDeadlineMissedAt() { return deadlineMissedAt; }
    public void setDeadlineMissedAt(Instant deadlineMissedAt) { this.deadlineMissedAt = deadlineMissedAt; }
    public Set<Label> getLabels() { return labels; }
    public Instant getUpdatedAt() { return updatedAt; }
    public Short getImportance() { return importance; }
    public void setImportance(Short importance) { this.importance = importance; }
    public int getCategoryPosition() { return categoryPosition; }
    public void setCategoryPosition(int categoryPosition) { this.categoryPosition = categoryPosition; }

    public TodoState getState() { return TodoState.valueOf(state); }
    public void setState(TodoState state) { this.state = state.name(); }
    public PossibleTimes getPossibleTimes() { return PossibleTimes.valueOf(possibleTimes); }
    public void setPossibleTimes(PossibleTimes possibleTimes) { this.possibleTimes = possibleTimes.name(); }
    public Double getReasonMoney() { return reasonMoney; }
    public void setReasonMoney(Double reasonMoney) { this.reasonMoney = reasonMoney; }
    public Double getReasonHoursPerYear() { return reasonHoursPerYear; }
    public void setReasonHoursPerYear(Double reasonHoursPerYear) { this.reasonHoursPerYear = reasonHoursPerYear; }
    public Short getReasonEmotional() { return reasonEmotional; }
    public void setReasonEmotional(Short reasonEmotional) { this.reasonEmotional = reasonEmotional; }
    public Instant getNotificationTime() { return notificationTime; }
    public void setNotificationTime(Instant notificationTime) { this.notificationTime = notificationTime; }
    public Instant getNotifiedAt() { return notifiedAt; }
    public void setNotifiedAt(Instant notifiedAt) { this.notifiedAt = notifiedAt; }

    /** What kind of to-do a task is. */
    public enum TodoState { TODO, DAILY, WEEKLY, MONTHLY, TO_FOLLOW_UP, CONDITIONAL, DELETED }

    /** When a task can be done. */
    public enum PossibleTimes { ALL_TIMES, WORKING_HOURS, ONLY_WEEKENDS }

    /** Marks the task as changed by someone now (not by background jobs like reminders). */
    public void touch() { this.updatedAt = Instant.now(); }

}
