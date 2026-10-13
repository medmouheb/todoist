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
    public Set<Label> getLabels() { return labels; }
}
