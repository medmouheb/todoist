package com.doable.task;

import com.doable.common.CurrentUser;
import com.doable.task.TaskDtos.CreateTaskRequest;
import com.doable.task.TaskDtos.TaskResponse;
import com.doable.task.TaskDtos.UpdateTaskRequest;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/tasks")
public class TaskController {

    private final TaskService tasks;

    public TaskController(TaskService tasks) {
        this.tasks = tasks;
    }

    /**
     * GET /api/tasks?view=today&date=2026-10-13 (inbox, today, upcoming),
     * /api/tasks?projectId=3, or /api/tasks?parentId=7 for sub-tasks.
     */
    @GetMapping
    public List<TaskResponse> list(@AuthenticationPrincipal Jwt jwt,
                                   @RequestParam(required = false) String view,
                                   @RequestParam(required = false) LocalDate date,
                                   @RequestParam(required = false) Long projectId,
                                   @RequestParam(required = false) Long parentId) {
        long user = CurrentUser.id(jwt);
        if (parentId != null) return tasks.subtasks(user, parentId);
        if (projectId != null) return tasks.byProject(user, projectId);
        return tasks.view(user, view == null ? "inbox" : view, date == null ? LocalDate.now() : date);
    }

    /** Completed tasks, newest first; all projects unless projectId is given. */
    @GetMapping("/completed")
    public List<TaskResponse> completed(@AuthenticationPrincipal Jwt jwt,
                                        @RequestParam(required = false) Long projectId,
                                        @RequestParam(defaultValue = "200") int limit) {
        return tasks.completed(CurrentUser.id(jwt), projectId, limit);
    }

    @GetMapping("/{id}")
    public TaskResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id) {
        return tasks.get(CurrentUser.id(jwt), id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TaskResponse create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CreateTaskRequest req) {
        return tasks.create(CurrentUser.id(jwt), req);
    }

    @PatchMapping("/{id}")
    public TaskResponse update(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id,
                               @Valid @RequestBody UpdateTaskRequest req) {
        return tasks.update(CurrentUser.id(jwt), id, req);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id) {
        tasks.delete(CurrentUser.id(jwt), id);
    }

    /** Undo a delete (within 7 days). */
    @PostMapping("/{id}/restore")
    public TaskResponse restore(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id) {
        return tasks.restore(CurrentUser.id(jwt), id);
    }
}
