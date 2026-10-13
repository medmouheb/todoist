package com.doable.project;

import com.doable.common.NotFoundException;
import com.doable.project.ProjectDtos.ProjectRequest;
import com.doable.project.ProjectDtos.ProjectResponse;
import com.doable.task.TaskRepository;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ProjectService {

    private final ProjectRepository projects;
    private final TaskRepository tasks;

    public ProjectService(ProjectRepository projects, TaskRepository tasks) {
        this.projects = projects;
        this.tasks = tasks;
    }

    @Transactional
    public Project createInbox(Long ownerId) {
        return projects.save(new Project(ownerId, "Inbox", "charcoal", true, 0));
    }

    @Transactional(readOnly = true)
    public List<ProjectResponse> list(Long ownerId) {
        Map<Long, Long> counts = tasks.countOpenByProject(ownerId);
        return projects.findByOwnerIdOrderByInboxDescPositionAscIdAsc(ownerId).stream()
                .map(p -> ProjectResponse.of(p, counts.getOrDefault(p.getId(), 0L)))
                .toList();
    }

    @Transactional(readOnly = true)
    public Project get(Long ownerId, Long id) {
        return projects.findByIdAndOwnerId(id, ownerId).orElseThrow(() -> new NotFoundException("Project"));
    }

    @Transactional(readOnly = true)
    public Project inbox(Long ownerId) {
        return projects.findByOwnerIdAndInboxTrue(ownerId).orElseThrow(() -> new NotFoundException("Inbox"));
    }

    @Transactional
    public ProjectResponse create(Long ownerId, ProjectRequest req) {
        Project p = new Project(ownerId, req.name().trim(), req.color() == null ? "charcoal" : req.color(),
                false, projects.countByOwnerId(ownerId));
        if (req.favorite() != null) {
            p.setFavorite(req.favorite());
        }
        return ProjectResponse.of(projects.save(p), 0);
    }

    @Transactional
    public ProjectResponse update(Long ownerId, Long id, ProjectRequest req) {
        Project p = get(ownerId, id);
        if (p.isInbox() && !p.getName().equals(req.name().trim())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The Inbox can't be renamed.");
        }
        p.setName(req.name().trim());
        if (req.color() != null) {
            p.setColor(req.color());
        }
        if (req.favorite() != null) {
            p.setFavorite(req.favorite());
        }
        return ProjectResponse.of(p, tasks.countByProjectIdAndCompletedFalse(p.getId()));
    }

    @Transactional
    public void delete(Long ownerId, Long id) {
        Project p = get(ownerId, id);
        if (p.isInbox()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The Inbox can't be deleted.");
        }
        projects.delete(p);
    }
}
