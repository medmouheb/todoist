package com.doable.project;

import com.doable.common.NotFoundException;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/** The one place that answers "may this person do this in that project?". */
@Service
@Transactional(readOnly = true)
public class ProjectAccess {

    private final ProjectRepository projects;
    private final ProjectMemberRepository members;

    public ProjectAccess(ProjectRepository projects, ProjectMemberRepository members) {
        this.projects = projects;
        this.members = members;
    }

    /**
     * The project, if the user is a member with at least {@code min}.
     * Non-members get 404 (so project ids can't be probed); members without the role get 403.
     */
    public Project require(Long userId, Long projectId, Role min) {
        ProjectMember m = members.find(projectId, userId).orElseThrow(() -> new NotFoundException("Project"));
        if (!m.getRole().atLeast(min)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, switch (min) {
                case ADMIN -> "Only project admins can do that.";
                default -> "Guests can only view and comment in this project.";
            });
        }
        return projects.findById(projectId).orElseThrow(() -> new NotFoundException("Project"));
    }

    public Role role(Long userId, Long projectId) {
        return members.find(projectId, userId).map(ProjectMember::getRole)
                .orElseThrow(() -> new NotFoundException("Project"));
    }

    public boolean isMember(Long userId, Long projectId) {
        return members.find(projectId, userId).isPresent();
    }

    /** Ids of every project this user belongs to; with activeOnly, archived projects are left out. */
    public List<Long> projectIds(Long userId, boolean activeOnly) {
        List<Long> ids = members.forUser(userId).stream().map(ProjectMember::getProjectId).toList();
        if (!activeOnly || ids.isEmpty()) return ids;
        return projects.findAllById(ids).stream().filter(p -> !p.isArchived()).map(Project::getId).toList();
    }
}
