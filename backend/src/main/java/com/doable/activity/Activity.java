package com.doable.activity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** One entry in the history: who did what to which task, with only the fields that changed. */
@Entity
@Table(name = "activities")
public class Activity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "project_id", nullable = false)
    private Long projectId;

    @Column(name = "task_id")
    private Long taskId;

    /** Kept so the history still reads well after the task is deleted for good. */
    @Column(name = "task_title")
    private String taskTitle;

    @Column(name = "actor_id")
    private Long actorId;

    @Column(nullable = false)
    private String action;

    /** field → [before, after], e.g. {"title": ["Old", "New"]}. Null when nothing field-level changed. */
    @JdbcTypeCode(SqlTypes.JSON)
    private Map<String, List<Object>> changes;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    protected Activity() {
    }

    public Activity(Long projectId, Long taskId, String taskTitle, Long actorId, String action,
                    Map<String, List<Object>> changes) {
        this.projectId = projectId;
        this.taskId = taskId;
        this.taskTitle = taskTitle;
        this.actorId = actorId;
        this.action = action;
        this.changes = changes == null || changes.isEmpty() ? null : new LinkedHashMap<>(changes);
    }

    /**
     * Folds a newer edit into this entry: each field keeps its first "before" and takes the latest
     * "after"; a field changed back to where it started drops out.
     */
    public void merge(Map<String, List<Object>> newer, String title) {
        Map<String, List<Object>> merged = changes == null ? new LinkedHashMap<>() : new LinkedHashMap<>(changes);
        newer.forEach((field, pair) -> {
            List<Object> old = merged.get(field);
            Object before = old == null ? pair.get(0) : old.get(0);
            if (Objects.equals(String.valueOf(before), String.valueOf(pair.get(1)))) merged.remove(field);
            else merged.put(field, java.util.Arrays.asList(before, pair.get(1)));
        });
        this.changes = merged.isEmpty() ? null : merged;
        this.taskTitle = title;
        this.createdAt = Instant.now();
    }

    public Long getId() { return id; }
    public Long getProjectId() { return projectId; }
    public Long getTaskId() { return taskId; }
    public String getTaskTitle() { return taskTitle; }
    public Long getActorId() { return actorId; }
    public String getAction() { return action; }
    public Map<String, List<Object>> getChanges() { return changes; }
    public Instant getCreatedAt() { return createdAt; }
}
