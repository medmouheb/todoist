package com.doable.project;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/** A pending invitation. Accepting turns it into a {@link ProjectMember}; it is deleted either way. */
@Entity
@Table(name = "project_invites")
public class ProjectInvite {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "project_id", nullable = false)
    private Long projectId;

    @Column(nullable = false)
    private String email;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Role role;

    @Column(name = "invited_by", nullable = false)
    private Long invitedBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    protected ProjectInvite() {
    }

    public ProjectInvite(Long projectId, String email, Role role, Long invitedBy) {
        this.projectId = projectId;
        this.email = email;
        this.role = role;
        this.invitedBy = invitedBy;
    }

    public Long getId() { return id; }
    public Long getProjectId() { return projectId; }
    public String getEmail() { return email; }
    public Role getRole() { return role; }
    public Long getInvitedBy() { return invitedBy; }
    public Instant getCreatedAt() { return createdAt; }
}
