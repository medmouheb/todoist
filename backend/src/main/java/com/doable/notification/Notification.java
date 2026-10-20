package com.doable.notification;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "notifications")
public class Notification {

    public enum Type {
        INVITE, INVITE_ACCEPTED, INVITE_DECLINED, ASSIGNED, COMMENT, MENTION,
        /** Someone else changed something in a shared project. */
        ACTIVITY,
        /** A timed task starts soon. */
        REMINDER,
        /** A deadline is less than a day away. */
        DEADLINE_SOON,
        /** A deadline passed and the task isn't done. */
        DEADLINE_MISSED
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Type type;

    @Column(name = "actor_id")
    private Long actorId;

    @Column(name = "project_id")
    private Long projectId;

    @Column(name = "task_id")
    private Long taskId;

    @Column(name = "invite_id")
    private Long inviteId;

    @Column(nullable = false)
    private String message;

    @Column(name = "read_at")
    private Instant readAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    protected Notification() {
    }

    public Notification(Long userId, Type type, Long actorId, Long projectId, Long taskId, Long inviteId,
                        String message) {
        this.userId = userId;
        this.type = type;
        this.actorId = actorId;
        this.projectId = projectId;
        this.taskId = taskId;
        this.inviteId = inviteId;
        this.message = message.length() > 500 ? message.substring(0, 497) + "…" : message;
    }

    /** Folds a newer event into this unread one instead of adding another notification. */
    public void merge(String message) {
        this.message = message.length() > 500 ? message.substring(0, 497) + "…" : message;
        this.createdAt = Instant.now();
    }

    public void markRead() {
        if (readAt == null) readAt = Instant.now();
    }

    public Long getId() { return id; }
    public Long getUserId() { return userId; }
    public Type getType() { return type; }
    public Long getActorId() { return actorId; }
    public Long getProjectId() { return projectId; }
    public Long getTaskId() { return taskId; }
    public Long getInviteId() { return inviteId; }
    public String getMessage() { return message; }
    public Instant getReadAt() { return readAt; }
    public Instant getCreatedAt() { return createdAt; }
}
