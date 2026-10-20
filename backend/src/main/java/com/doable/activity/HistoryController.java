package com.doable.activity;

import com.doable.common.CurrentUser;
import com.doable.common.NotFoundException;
import com.doable.project.Project;
import com.doable.project.ProjectAccess;
import com.doable.project.ProjectRepository;
import com.doable.task.Task;
import com.doable.task.TaskRepository;
import com.doable.user.User;
import com.doable.user.UserRepository;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.data.domain.Limit;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * GET /api/history?projectId=3 | ?taskId=7 | (nothing: all your projects), newest first.
 * Pass the returned nextBefore as ?before= to get the next page.
 */
@RestController
public class HistoryController {

    public record HistoryEntry(Long id, String action, Long actorId, String actorName, String actorInitials,
                               Long projectId, String projectName, String projectColor, Long taskId, String taskTitle,
                               Map<String, List<Object>> changes, Instant createdAt) {
    }

    public record HistoryPage(List<HistoryEntry> items, Long nextBefore) {
    }

    private final ActivityRepository activities;
    private final ProjectAccess access;
    private final ProjectRepository projects;
    private final TaskRepository tasks;
    private final UserRepository users;

    public HistoryController(ActivityRepository activities, ProjectAccess access, ProjectRepository projects,
                             TaskRepository tasks, UserRepository users) {
        this.activities = activities;
        this.access = access;
        this.projects = projects;
        this.tasks = tasks;
        this.users = users;
    }

    @GetMapping("/api/history")
    @Transactional(readOnly = true)
    public HistoryPage history(@AuthenticationPrincipal Jwt jwt,
                               @RequestParam(required = false) Long projectId,
                               @RequestParam(required = false) Long taskId,
                               @RequestParam(required = false) Long before,
                               @RequestParam(defaultValue = "30") int limit) {
        long userId = CurrentUser.id(jwt);
        int size = Math.max(1, Math.min(limit, 100));
        long cursor = before == null ? Long.MAX_VALUE : before;
        List<Activity> found;
        if (taskId != null) {
            // Deleted tasks keep their history, so look the task up including deleted ones.
            Task t = tasks.findById(taskId).orElseThrow(() -> new NotFoundException("Task"));
            if (!access.isMember(userId, t.getProjectId())) throw new NotFoundException("Task");
            found = activities.findByTaskIdAndIdLessThanOrderByIdDesc(taskId, cursor, Limit.of(size + 1));
        } else {
            List<Long> ids = projectId != null ? List.of(access.require(userId, projectId,
                    com.doable.project.Role.GUEST).getId()) : access.projectIds(userId, false);
            found = ids.isEmpty() ? List.of()
                    : activities.findByProjectIdInAndIdLessThanOrderByIdDesc(ids, cursor, Limit.of(size + 1));
        }
        boolean more = found.size() > size;
        List<Activity> page = more ? found.subList(0, size) : found;

        Map<Long, User> actors = users.byIds(page.stream().map(Activity::getActorId).filter(Objects::nonNull)
                .distinct().toList());
        Map<Long, Project> ps = projects.findAllById(page.stream().map(Activity::getProjectId).distinct().toList())
                .stream().collect(Collectors.toMap(Project::getId, Function.identity()));
        List<HistoryEntry> items = page.stream().map(a -> {
            User u = a.getActorId() == null ? null : actors.get(a.getActorId());
            Project p = ps.get(a.getProjectId());
            return new HistoryEntry(a.getId(), a.getAction(), a.getActorId(),
                    u == null ? "Someone" : u.getName(), u == null ? "?" : User.initials(u.getName()),
                    a.getProjectId(), p == null ? null : p.getName(), p == null ? null : p.getColor(),
                    a.getTaskId(), a.getTaskTitle(), a.getChanges(), a.getCreatedAt());
        }).toList();
        return new HistoryPage(items, more ? page.getLast().getId() : null);
    }
}
