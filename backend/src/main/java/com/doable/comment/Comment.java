package com.doable.comment;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "comments")
public class Comment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "task_id", nullable = false, updatable = false)
    private Long taskId;

    @Column(name = "author_id", nullable = false, updatable = false)
    private Long authorId;

    @Column(nullable = false, columnDefinition = "text")
    private String body;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    protected Comment() {
    }

    public Comment(Long taskId, Long authorId, String body) {
        this.taskId = taskId;
        this.authorId = authorId;
        this.body = body;
    }

    public Long getId() { return id; }
    public Long getTaskId() { return taskId; }
    public Long getAuthorId() { return authorId; }
    public String getBody() { return body; }
    public Instant getCreatedAt() { return createdAt; }
}
