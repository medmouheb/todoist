package com.doable.project;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "projects")
public class Project {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Who created it. Access is decided by {@link ProjectMember}, not by this. */
    @Column(name = "owner_id", nullable = false, updatable = false)
    private Long ownerId;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String color;

    @Column(nullable = false, updatable = false)
    private boolean inbox;

    @Column(nullable = false)
    private boolean archived;

    @Column(nullable = false)
    private int position;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    protected Project() {
    }

    public Project(Long ownerId, String name, String color, boolean inbox, int position) {
        this.ownerId = ownerId;
        this.name = name;
        this.color = color;
        this.inbox = inbox;
        this.position = position;
    }

    public Long getId() { return id; }
    public Long getOwnerId() { return ownerId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getColor() { return color; }
    public void setColor(String color) { this.color = color; }
    public boolean isInbox() { return inbox; }
    public boolean isArchived() { return archived; }
    public void setArchived(boolean archived) { this.archived = archived; }
    public int getPosition() { return position; }
    public Instant getCreatedAt() { return createdAt; }
}
