package com.doable.task;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalTime;

/**
 * Something that must hold before a task can be done: another task finished first (AFTER), a time
 * window (TIME), a place (PLACE), someone around (PERSON), or any other state (STATE, e.g. "healthy").
 */
@Entity
@Table(name = "task_conditions")
public class TaskCondition {

    public enum Type { AFTER, TIME, PLACE, PERSON, STATE }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "task_id", nullable = false, updatable = false)
    private Long taskId;

    @Column(nullable = false, length = 10)
    private String type;

    private String value;

    @Column(name = "after_task_id")
    private Long afterTaskId;

    @Column(name = "start_time")
    private LocalTime startTime;

    @Column(name = "end_time")
    private LocalTime endTime;

    @Column(nullable = false)
    private int position;

    protected TaskCondition() {
    }

    public TaskCondition(Long taskId, Type type, int position) {
        this.taskId = taskId;
        this.type = type.name();
        this.position = position;
    }

    public Long getId() { return id; }
    public Long getTaskId() { return taskId; }
    public Type getType() { return Type.valueOf(type); }
    public String getValue() { return value; }
    public void setValue(String value) { this.value = value; }
    public Long getAfterTaskId() { return afterTaskId; }
    public void setAfterTaskId(Long afterTaskId) { this.afterTaskId = afterTaskId; }
    public LocalTime getStartTime() { return startTime; }
    public void setStartTime(LocalTime startTime) { this.startTime = startTime; }
    public LocalTime getEndTime() { return endTime; }
    public void setEndTime(LocalTime endTime) { this.endTime = endTime; }
    public int getPosition() { return position; }

    /** "after “Book the venue”", "09:00–12:00", "at Office", "with Sara", "healthy" */
    public String describe(String afterTitle) {
        return switch (getType()) {
            case AFTER -> "after “" + (afterTitle == null ? "a task" : afterTitle) + "”";
            case TIME -> (startTime == null ? "…" : startTime.toString()) + "–" + (endTime == null ? "…" : endTime.toString());
            case PLACE -> "at " + value;
            case PERSON -> "with " + value;
            case STATE -> value;
        };
    }
}
