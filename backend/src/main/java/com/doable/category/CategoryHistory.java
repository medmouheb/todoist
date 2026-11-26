package com.doable.category;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/** One move or rename of a category. */
@Entity
@Table(name = "category_history")
public class CategoryHistory {

    public enum Action { CREATED, MOVED, RENAMED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "category_id", nullable = false, updatable = false)
    private Long categoryId;

    @Column(nullable = false, length = 20)
    private String action;

    @Column(name = "from_value")
    private String fromValue;

    @Column(name = "to_value")
    private String toValue;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    protected CategoryHistory() {
    }

    public CategoryHistory(Long categoryId, Action action, String fromValue, String toValue) {
        this.categoryId = categoryId;
        this.action = action.name();
        this.fromValue = fromValue;
        this.toValue = toValue;
    }

    public Long getId() { return id; }
    public Long getCategoryId() { return categoryId; }
    public String getAction() { return action; }
    public String getFromValue() { return fromValue; }
    public String getToValue() { return toValue; }
    public Instant getCreatedAt() { return createdAt; }
}
