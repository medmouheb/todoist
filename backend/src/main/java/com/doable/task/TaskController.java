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
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/tasks")
public class TaskController {

    private final TaskService tasks;
    private final TaskLockService locks;

    public TaskController(TaskService tasks, TaskLockService locks) {
        this.tasks = tasks;
        this.locks = locks;
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
                                   @RequestParam(required = false) Long parentId,
                                   @RequestParam(required = false) Long categoryId) {
        long user = CurrentUser.id(jwt);
        if (parentId != null) return tasks.subtasks(user, parentId);
        if (categoryId != null) return tasks.byCategory(user, categoryId);
        if (projectId != null) return tasks.byProject(user, projectId);
        return tasks.view(user, view == null ? "inbox" : view, date == null ? LocalDate.now() : date);
    }

    /** Every open task and sub-task in your active projects, for the tree view. */
    @GetMapping("/tree")
    public List<TaskResponse> tree(@AuthenticationPrincipal Jwt jwt) {
        return tasks.tree(CurrentUser.id(jwt));
    }

    /** Saves the order of sibling tasks after drag and drop. */
    @PutMapping("/order")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void reorder(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody TaskDtos.OrderRequest req) {
        tasks.reorder(CurrentUser.id(jwt), req.ids());
    }

    /** Saves the order of tasks inside a category after drag and drop in the tree viewer. */
    @PutMapping("/category-order")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void reorderInCategory(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody TaskDtos.CategoryOrderRequest req) {
        tasks.reorderInCategory(CurrentUser.id(jwt), req.categoryId(), req.ids());
    }

    @PostMapping("/{id}/conditions")
    @ResponseStatus(HttpStatus.CREATED)
    public TaskResponse addCondition(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id,
                                     @Valid @RequestBody TaskDtos.ConditionRequest req) {
        return tasks.addCondition(CurrentUser.id(jwt), id, req);
    }

    @DeleteMapping("/{id}/conditions/{conditionId}")
    public TaskResponse removeCondition(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id, @PathVariable Long conditionId) {
        return tasks.removeCondition(CurrentUser.id(jwt), id, conditionId);
    }

    // ---- editing locks ----

    public record UnlockRequest(@jakarta.validation.constraints.Size(max = 300) String message) {
    }

    /** Takes or renews the editing lock (call every 30 s while editing); says who holds it. */
    @PostMapping("/{id}/lock")
    public TaskLockService.LockState lock(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id) {
        return locks.acquire(CurrentUser.id(jwt), id);
    }

    @GetMapping("/{id}/lock")
    public TaskLockService.LockState lockState(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id) {
        return locks.state(CurrentUser.id(jwt), id);
    }

    @DeleteMapping("/{id}/lock")
    public TaskLockService.LockState unlock(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id) {
        return locks.release(CurrentUser.id(jwt), id);
    }

    /** Asks whoever is editing the task to unlock it. */
    @PostMapping("/{id}/lock/request")
    public TaskLockService.LockState requestUnlock(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id,
                                                   @Valid @RequestBody(required = false) UnlockRequest req) {
        return locks.requestUnlock(CurrentUser.id(jwt), id, req == null ? null : req.message());
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
