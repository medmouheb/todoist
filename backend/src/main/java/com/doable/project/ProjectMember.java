package com.doable.project;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.time.Instant;

@Entity
@Table(name = "project_members")
public class ProjectMember {

    @Embeddable
    public record Key(@Column(name = "project_id") Long projectId, @Column(name = "user_id") Long userId)
            implements Serializable {
    }

    @EmbeddedId
    private Key id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Role role;

    /** Favorites are personal: each member chooses their own. */
    @Column(nullable = false)
    private boolean favorite;

    @Column(name = "joined_at", nullable = false, updatable = false)
    private Instant joinedAt = Instant.now();

    protected ProjectMember() {
    }

    public ProjectMember(Long projectId, Long userId, Role role) {
        this.id = new Key(projectId, userId);
        this.role = role;
    }

    public Long getProjectId() { return id.projectId(); }
    public Long getUserId() { return id.userId(); }
    public Role getRole() { return role; }
    public void setRole(Role role) { this.role = role; }
    public boolean isFavorite() { return favorite; }
    public void setFavorite(boolean favorite) { this.favorite = favorite; }
    public Instant getJoinedAt() { return joinedAt; }
}
