package com.doable.project;

import com.doable.activity.ActivityService;
import com.doable.activity.ActivityService.Action;
import com.doable.common.NotFoundException;
import com.doable.project.ProjectDtos.ProjectRequest;
import com.doable.project.ProjectDtos.ProjectResponse;
import com.doable.task.TaskRepository;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ProjectService {

    private final ProjectRepository projects;
    private final ProjectMemberRepository members;
    private final ProjectAccess access;
    private final TaskRepository tasks;
    private final ActivityService activity;

    public ProjectService(ProjectRepository projects, ProjectMemberRepository members, ProjectAccess access,
                          TaskRepository tasks, ActivityService activity) {
        this.projects = projects;
        this.members = members;
        this.access = access;
        this.tasks = tasks;
        this.activity = activity;
    }

    @Transactional
    public Project createInbox(Long userId) {
        Project inbox = projects.save(new Project(userId, "Inbox", "charcoal", true, 0));
        members.save(new ProjectMember(inbox.getId(), userId, Role.ADMIN));
        return inbox;
    }

    @Transactional(readOnly = true)
    public List<ProjectResponse> list(Long userId) {
        List<ProjectMember> mine = members.forUser(userId);
        Map<Long, Project> byId = projects.findAllById(mine.stream().map(ProjectMember::getProjectId).toList())
                .stream().collect(Collectors.toMap(Project::getId, Function.identity()));
        Map<Long, Long> open = tasks.countOpenByProject(byId.keySet());
        Map<Long, Long> memberCounts = members.memberCounts(userId);
        return mine.stream()
                .map(m -> toResponse(byId.get(m.getProjectId()), m, open, memberCounts))
                .sorted(Comparator.comparing(ProjectResponse::inbox).reversed()
                        .thenComparing(ProjectResponse::position).thenComparing(ProjectResponse::id))
                .toList();
    }

    @Transactional(readOnly = true)
    public ProjectResponse get(Long userId, Long projectId) {
        return list(userId).stream().filter(p -> p.id().equals(projectId)).findFirst()
                .orElseThrow(() -> new NotFoundException("Project"));
    }

    @Transactional(readOnly = true)
    public Project inbox(Long userId) {
        return projects.findByOwnerIdAndInboxTrue(userId).orElseThrow(() -> new NotFoundException("Inbox"));
    }

    @Transactional
    public ProjectResponse create(Long userId, ProjectRequest req) {
        if (req.name() == null || req.name().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Give the project a name.");
        }
        Project p = projects.save(new Project(userId, req.name().trim(),
                req.color() == null ? "charcoal" : req.color(), false, projects.countByOwnerId(userId)));
        ProjectMember m = new ProjectMember(p.getId(), userId, Role.ADMIN);
        m.setFavorite(Boolean.TRUE.equals(req.favorite()));
        m.setPosition(members.forUser(userId).size());
        members.save(m);
        activity.record(userId, p.getId(), null, null, Action.PROJECT_CREATED, null);
        return get(userId, p.getId());
    }

    @Transactional
    public ProjectResponse update(Long userId, Long id, ProjectRequest req) {
        ProjectMember me = members.find(id, userId).orElseThrow(() -> new NotFoundException("Project"));
        Project p = projects.findById(id).orElseThrow(() -> new NotFoundException("Project"));
        boolean renaming = req.name() != null && !req.name().trim().equals(p.getName());
        boolean recoloring = req.color() != null && !req.color().equals(p.getColor());
        boolean archiving = req.archived() != null && req.archived() != p.isArchived();
        if (renaming || recoloring || archiving) {
            access.require(userId, id, Role.ADMIN);
            if (p.isInbox()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The Inbox can't be renamed or archived.");
            }
        }
        Map<String, Object> before = Map.of("name", p.getName(), "color", p.getColor());
        if (renaming) p.setName(req.name().trim());
        if (recoloring) p.setColor(req.color());
        if (archiving) {
            p.setArchived(req.archived());
            activity.record(userId, id, null, null, req.archived() ? Action.PROJECT_ARCHIVED : Action.PROJECT_UNARCHIVED, null);
        }
        if (renaming || recoloring) {
            activity.record(userId, id, null, null, Action.PROJECT_UPDATED,
                    ActivityService.diff(before, Map.of("name", p.getName(), "color", p.getColor())));
        }
        if (req.favorite() != null) me.setFavorite(req.favorite());
        return get(userId, id);
    }

    /** Sets this person's sidebar order; ids not listed keep their place after the listed ones. */
    @Transactional
    public void reorder(Long userId, List<Long> projectIds) {
        Map<Long, ProjectMember> mine = members.forUser(userId).stream()
                .collect(Collectors.toMap(ProjectMember::getProjectId, Function.identity()));
        int pos = 0;
        for (Long id : projectIds) {
            ProjectMember m = mine.remove(id);
            if (m != null) m.setPosition(pos++);
        }
        for (ProjectMember m : mine.values().stream().sorted(Comparator.comparing(ProjectMember::getPosition)).toList()) {
            m.setPosition(pos++);
        }
    }

    @Transactional
    public void delete(Long userId, Long id) {
        Project p = access.require(userId, id, Role.ADMIN);
        if (p.isInbox()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The Inbox can't be deleted.");
        }
        projects.delete(p);
    }

    private static ProjectResponse toResponse(Project p, ProjectMember m, Map<Long, Long> open,
                                              Map<Long, Long> memberCounts) {
        return new ProjectResponse(p.getId(), p.getName(), p.getColor(), m.isFavorite(), p.isInbox(), p.isArchived(),
                m.getPosition(), open.getOrDefault(p.getId(), 0L), m.getRole(),
                memberCounts.getOrDefault(p.getId(), 1L));
    }
}
