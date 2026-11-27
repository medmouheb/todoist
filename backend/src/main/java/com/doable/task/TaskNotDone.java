package com.doable.task;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;

/** Why a task wasn't done when its notification went out. */
@Entity
@Table(name = "task_not_done")
public class TaskNotDone {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "task_id", nullable = false, updatable = false)
    private Long taskId;

    @Column(name = "notification_time", nullable = false, updatable = false)
    private Instant notificationTime;

    /** One reason per line. */
    @Column(nullable = false, columnDefinition = "text")
    private String reasons;

    @Column(name = "created_by", nullable = false, updatable = false)
    private Long createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    protected TaskNotDone() {
    }

    public TaskNotDone(Long taskId, Instant notificationTime, List<String> reasons, Long createdBy) {
        this.taskId = taskId;
        this.notificationTime = notificationTime;
        this.reasons = String.join("\n", reasons);
        this.createdBy = createdBy;
    }

    public Long getId() { return id; }
    public Long getTaskId() { return taskId; }
    public Instant getNotificationTime() { return notificationTime; }
    public List<String> getReasons() { return Arrays.stream(reasons.split("\n")).filter(s -> !s.isBlank()).toList(); }
    public Instant getCreatedAt() { return createdAt; }
}
