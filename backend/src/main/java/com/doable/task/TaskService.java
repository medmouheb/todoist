package com.doable.task;

import com.doable.activity.ActivityService;
import com.doable.activity.ActivityService.Action;
import com.doable.category.Category;
import com.doable.category.CategoryRepository;
import com.doable.comment.CommentRepository;
import com.doable.common.NotFoundException;
import com.doable.label.Label;
import com.doable.label.LabelService;
import com.doable.notification.NotificationService;
import com.doable.project.Project;
import com.doable.project.ProjectAccess;
import com.doable.project.ProjectRepository;
import com.doable.project.ProjectService;
import com.doable.project.Role;
import com.doable.task.TaskDtos.CategoryRef;
import com.doable.task.TaskDtos.CreateTaskRequest;
import com.doable.task.TaskDtos.LabelRef;
import com.doable.task.TaskDtos.PersonRef;
import com.doable.task.TaskDtos.TaskResponse;
import com.doable.task.TaskDtos.UpdateTaskRequest;
import com.doable.user.User;
import com.doable.user.UserRepository;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.springframework.data.domain.Limit;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class TaskService {

    /** Sub-tasks can nest this deep (a top-level task is level 1). */
    static final int MAX_DEPTH = 4;

    /** Date views: dated tasks first by date and time, then by priority, then in their manual order. */
    private static final Comparator<Task> BY_DATE = Comparator
            .comparing(Task::getDueDate, Comparator.nullsLast(Comparator.naturalOrder()))
            .thenComparing(Task::getDueTime, Comparator.nullsLast(Comparator.naturalOrder()))
            .thenComparing(Task::getPriority)
            .thenComparing(Task::getPosition)
            .thenComparing(Task::getId);

    /** Project, Inbox and sub-task lists: the order people dragged them into. */
    private static final Comparator<Task> MANUAL = Comparator.comparing(Task::getPosition).thenComparing(Task::getId);

    private final TaskRepository tasks;
    private final ProjectService projects;
    private final ProjectRepository projectRepo;
    private final ProjectAccess access;
    private final LabelService labels;
    private final CommentRepository comments;
    private final CategoryRepository categories;
    private final UserRepository users;
    private final NotificationService notifications;
    private final ActivityService activity;
    private final TaskConditionRepository conditions;
    private final TaskLockService locks;
    private final com.doable.project.ProjectMemberRepository members;
    private final TaskNotDoneRepository notDone;

    public TaskService(TaskRepository tasks, ProjectService projects, ProjectRepository projectRepo, ProjectAccess access,
                       LabelService labels, CommentRepository comments, CategoryRepository categories,
                       UserRepository users, NotificationService notifications, ActivityService activity,
                       TaskConditionRepository conditions, TaskLockService locks,
                       com.doable.project.ProjectMemberRepository members, TaskNotDoneRepository notDone) {
        this.notDone = notDone;
        this.conditions = conditions;
        this.locks = locks;
        this.members = members;
        this.tasks = tasks;
        this.projects = projects;
        this.projectRepo = projectRepo;
        this.access = access;
        this.labels = labels;
        this.comments = comments;
        this.categories = categories;
        this.users = users;
        this.notifications = notifications;
        this.activity = activity;
    }

    // ---- reading ----

    /**
     * @param today the user's local date, sent by the client so "Today" follows their time zone
     */
    @Transactional(readOnly = true)
    public List<TaskResponse> view(Long userId, String view, LocalDate today) {
        List<Long> active = access.projectIds(userId, true);
        List<Task> found = switch (view) {
            case "inbox" -> tasks.openTopLevel(projects.inbox(userId).getId()).stream().sorted(MANUAL).toList();
            case "today" -> active.isEmpty() ? List.of() : tasks.dueOnOrBefore(active, today, userId).stream().sorted(BY_DATE).toList();
            case "upcoming" -> active.isEmpty() ? List.of() : tasks.dueOnOrAfter(active, today, userId).stream().sorted(BY_DATE).toList();
            default -> throw new NotFoundException("View '" + view + "'");
        };
        return toResponses(found);
    }

    @Transactional(readOnly = true)
    public List<TaskResponse> byProject(Long userId, Long projectId) {
        access.require(userId, projectId, Role.GUEST);
        return toResponses(tasks.openTopLevel(projectId).stream().sorted(MANUAL).toList());
    }

    /** Open tasks in one of the user's categories, across all active projects. */
    @Transactional(readOnly = true)
    public List<TaskResponse> byCategory(Long userId, Long categoryId) {
        categories.findByIdAndOwnerId(categoryId, userId).orElseThrow(() -> new NotFoundException("Category"));
        List<Long> active = access.projectIds(userId, true);
        return active.isEmpty() ? List.of()
                : toResponses(tasks.openInCategory(active, categoryId).stream().sorted(BY_DATE).toList());
    }

    /** Every open task and sub-task in the user's active projects, in manual order, for the tree view. */
    @Transactional(readOnly = true)
    public List<TaskResponse> tree(Long userId) {
        List<Long> active = access.projectIds(userId, true);
        return active.isEmpty() ? List.of() : toResponses(tasks.openIn(active).stream().sorted(MANUAL).toList());
    }

    /** Completed tasks, newest first, in one project or in all of the user's projects. */
    @Transactional(readOnly = true)
    public List<TaskResponse> completed(Long userId, Long projectId, int limit) {
        List<Long> ids;
        if (projectId != null) {
            access.require(userId, projectId, Role.GUEST);
            ids = List.of(projectId);
        } else {
            ids = access.projectIds(userId, false);
        }
        return ids.isEmpty() ? List.of() : toResponses(tasks.completedIn(ids, Limit.of(Math.min(limit, 500))));
    }

    @Transactional(readOnly = true)
    public TaskResponse get(Long userId, Long id) {
        return toResponse(visible(userId, id));
    }

    /** Direct sub-tasks: open ones in their manual order, then completed ones. */
    @Transactional(readOnly = true)
    public List<TaskResponse> subtasks(Long userId, Long parentId) {
        visible(userId, parentId);
        return toResponses(tasks.children(parentId).stream()
                .sorted(Comparator.comparing(Task::isCompleted).thenComparing(MANUAL))
                .toList());
    }

    // ---- writing ----

    @Transactional
    public TaskResponse create(Long userId, CreateTaskRequest req) {
        Long projectId;
        Task parent = null;
        if (req.parentId() != null) {
            parent = visible(userId, req.parentId());
            if (depth(parent) >= MAX_DEPTH) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Sub-tasks can only be nested " + MAX_DEPTH + " levels deep.");
            }
            projectId = parent.getProjectId();
        } else {
            projectId = req.projectId() == null ? projects.inbox(userId).getId() : req.projectId();
        }
        access.require(userId, projectId, Role.MEMBER);
        validateRecurrence(req.recurrence());

        Task t = new Task(userId, projectId, req.title().trim());
        if (parent != null) t.setParentId(parent.getId());
        t.setDescription(blankToNull(req.description()));
        if (req.priority() != null) t.setPriority(req.priority());
        t.setRecurrence(Recurrence.normalize(req.recurrence()));
        t.setDueDate(req.dueDate() == null && t.getRecurrence() != null
                ? Recurrence.advance(t.getRecurrence(), null, LocalDate.now()) : req.dueDate());
        if (t.getDueDate() != null) t.setDueTime(req.dueTime());
        // The duration is an estimate, so it doesn’t need a date.
        t.setDurationMinutes(req.durationMinutes());
        if (req.labels() != null) t.getLabels().addAll(labels.resolve(userId, req.labels()));
        if (req.categoryId() != null) t.setCategoryId(ownCategory(userId, req.categoryId()).getId());
        t.setDeadline(req.deadline());
        if (req.state() != null) t.setState(liveState(req.state()));
        if (req.possibleTimes() != null) t.setPossibleTimes(req.possibleTimes());
        setReason(t, req.reason());
        t.setNotificationTime(req.notificationTime());
        if (t.getCategoryId() != null) t.setCategoryPosition(tasks.nextCategoryPosition(t.getCategoryId()));
        t.setPosition(tasks.countInProject(projectId));
        tasks.save(t);
        if (req.assigneeId() != null) assign(userId, t, req.assigneeId());
        activity.record(userId, projectId, t.getId(), t.getTitle(), Action.CREATED, null);
        return toResponse(t);
    }

    @Transactional
    public TaskResponse update(Long userId, Long id, UpdateTaskRequest req) {
        Task t = visible(userId, id);
        locks.check(userId, id);
        Role role = access.role(userId, t.getProjectId());
        boolean onlyCompleting = req.completed() != null && req.title() == null && req.description() == null
                && req.priority() == null && req.dueDate() == null && req.dueTime() == null
                && req.durationMinutes() == null && req.recurrence() == null && req.projectId() == null
                && req.assigneeId() == null && req.labels() == null && req.clearDueDate() == null
                && req.clearAssignee() == null && req.clearDueTime() == null && req.clearDuration() == null
                && req.clearRecurrence() == null && req.categoryId() == null && req.clearCategory() == null
                && req.deadline() == null && req.clearDeadline() == null
                && req.importance() == null && req.clearImportance() == null
                && req.state() == null && req.possibleTimes() == null && req.reason() == null && req.clearReason() == null
                && req.notificationTime() == null && req.clearNotificationTime() == null;
        boolean guestOwnTask = role == Role.GUEST && onlyCompleting && userId.equals(t.getAssigneeId());
        if (!role.atLeast(Role.MEMBER) && !guestOwnTask) {
            access.require(userId, t.getProjectId(), Role.MEMBER); // throws the 403
        }

        Map<String, Object> before = snapshot(t);
        boolean wasCompleted = t.isCompleted();
        Long fromProject = t.getProjectId();
        LocalDate oldDate = t.getDueDate();
        Object oldTime = t.getDueTime();
        Instant oldDeadline = t.getDeadline();

        if (req.title() != null) t.setTitle(req.title().trim());
        if (req.description() != null) t.setDescription(blankToNull(req.description()));
        if (req.priority() != null) t.setPriority(req.priority());

        if (Boolean.TRUE.equals(req.clearDueDate())) {
            t.setDueDate(null);
            t.setDueTime(null);
            t.setRecurrence(null);
        } else {
            if (req.recurrence() != null) {
                validateRecurrence(req.recurrence());
                t.setRecurrence(Recurrence.normalize(req.recurrence()));
            }
            if (Boolean.TRUE.equals(req.clearRecurrence())) t.setRecurrence(null);
            if (req.dueDate() != null) t.setDueDate(req.dueDate());
            if (t.getDueDate() == null && t.getRecurrence() != null) {
                t.setDueDate(Recurrence.advance(t.getRecurrence(), null, today(req)));
            }
            if (req.dueTime() != null) t.setDueTime(req.dueTime());
            if (Boolean.TRUE.equals(req.clearDueTime())) t.setDueTime(null);
        }
        if (req.durationMinutes() != null) t.setDurationMinutes(req.durationMinutes());
        if (Boolean.TRUE.equals(req.clearDuration())) t.setDurationMinutes(null);

        if (req.labels() != null) {
            t.getLabels().clear();
            t.getLabels().addAll(labels.resolve(userId, req.labels()));
        }
        Long oldCategory = t.getCategoryId();
        if (Boolean.TRUE.equals(req.clearCategory())) t.setCategoryId(null);
        else if (req.categoryId() != null) t.setCategoryId(ownCategory(userId, req.categoryId()).getId());
        // A task moved to another category goes to the end of it.
        if (t.getCategoryId() != null && !t.getCategoryId().equals(oldCategory)) {
            t.setCategoryPosition(tasks.nextCategoryPosition(t.getCategoryId()));
        }
        if (Boolean.TRUE.equals(req.clearDeadline())) t.setDeadline(null);
        else if (req.deadline() != null) t.setDeadline(req.deadline());
        if (Boolean.TRUE.equals(req.clearImportance())) t.setImportance(null);
        else if (req.importance() != null) t.setImportance(req.importance());
        if (req.state() != null) t.setState(liveState(req.state()));
        if (req.possibleTimes() != null) t.setPossibleTimes(req.possibleTimes());
        if (Boolean.TRUE.equals(req.clearReason())) setReason(t, new TaskDtos.Reason(null, null, null));
        else if (req.reason() != null) setReason(t, req.reason());
        Instant oldNotification = t.getNotificationTime();
        if (Boolean.TRUE.equals(req.clearNotificationTime())) t.setNotificationTime(null);
        else if (req.notificationTime() != null) t.setNotificationTime(req.notificationTime());
        if (!Objects.equals(oldNotification, t.getNotificationTime())) t.setNotifiedAt(null);

        if (req.projectId() != null && !req.projectId().equals(t.getProjectId())) {
            move(userId, t, req.projectId());
        }
        if (Boolean.TRUE.equals(req.clearAssignee())) {
            t.setAssigneeId(null);
        } else if (req.assigneeId() != null && !req.assigneeId().equals(t.getAssigneeId())) {
            assign(userId, t, req.assigneeId());
        }
        if (req.completed() != null && req.completed() != t.isCompleted()) {
            complete(t, req.completed(), today(req));
        }

        // A new date, time or deadline means its notifications can go out again.
        if (!Objects.equals(oldDate, t.getDueDate()) || !Objects.equals(oldTime, t.getDueTime())) t.setReminderSentAt(null);
        if (!Objects.equals(oldDeadline, t.getDeadline())) {
            t.setDeadlineWarnedAt(null);
            t.setDeadlineMissedAt(null);
        }

        t.touch();
        recordUpdate(userId, t, before, wasCompleted, fromProject, req.completed());
        return toResponse(t);
    }

    /** Saves a new manual order for sibling tasks (same project, same parent). */
    @Transactional
    public void reorder(Long userId, List<Long> ids) {
        List<Task> found = tasks.findAllById(ids);
        if (found.size() != new HashSet<>(ids).size() || found.stream().anyMatch(t -> t.getDeletedAt() != null)) {
            throw new NotFoundException("Task");
        }
        Task first = found.getFirst();
        boolean siblings = found.stream().allMatch(t -> t.getProjectId().equals(first.getProjectId())
                && Objects.equals(t.getParentId(), first.getParentId()));
        if (!siblings) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only tasks in the same list can be reordered together.");
        }
        access.require(userId, first.getProjectId(), Role.MEMBER);
        Map<Long, Task> byId = found.stream().collect(Collectors.toMap(Task::getId, Function.identity()));
        // Keep the positions these tasks already used, just in the new order, so tasks not in the
        // request (completed ones, say) keep their places.
        List<Integer> slots = found.stream().map(Task::getPosition).sorted().toList();
        boolean distinct = new HashSet<>(slots).size() == slots.size();
        for (int i = 0; i < ids.size(); i++) byId.get(ids.get(i)).setPosition(distinct ? slots.get(i) : i);

        Task parent = first.getParentId() == null ? null : tasks.findById(first.getParentId()).orElse(null);
        activity.record(userId, first.getProjectId(), parent == null ? null : parent.getId(),
                parent == null ? null : parent.getTitle(), Action.REORDERED, null);
    }

    /** Saves the order of tasks inside one category (null = tasks without a category). */
    @Transactional
    public void reorderInCategory(Long userId, Long categoryId, List<Long> ids) {
        if (categoryId != null) ownCategory(userId, categoryId);
        List<Task> found = tasks.findAllById(ids);
        for (Task t : found) {
            if (t.getDeletedAt() != null || !Objects.equals(t.getCategoryId(), categoryId)) throw new NotFoundException("Task");
            access.require(userId, t.getProjectId(), Role.MEMBER);
        }
        Map<Long, Task> byId = found.stream().collect(Collectors.toMap(Task::getId, Function.identity()));
        for (int i = 0; i < ids.size(); i++) {
            Task t = byId.get(ids.get(i));
            if (t != null) t.setCategoryPosition(i);
        }
    }

    // ---- conditions of doing ----

    /** Adds a condition (another task first, a time window, a place, a person, a state). */
    @Transactional
    public TaskResponse addCondition(Long userId, Long taskId, TaskDtos.ConditionRequest req) {
        Task t = visible(userId, taskId);
        locks.check(userId, taskId);
        access.require(userId, t.getProjectId(), Role.MEMBER);
        if (conditions.countByTaskId(taskId) >= 20) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A task can have at most 20 conditions.");
        }
        Map<String, Object> before = snapshot(t);
        TaskCondition c = new TaskCondition(taskId, req.type(), conditions.countByTaskId(taskId));
        switch (req.type()) {
            case AFTER -> {
                if (req.afterTaskId() == null) throw bad("Pick the task that has to be done first.");
                Task other = visible(userId, req.afterTaskId());
                if (other.getId().equals(taskId) || dependsOn(other.getId(), taskId)) {
                    throw bad("That would make the two tasks wait for each other.");
                }
                c.setAfterTaskId(other.getId());
            }
            case TIME -> {
                if (req.startTime() == null && req.endTime() == null) throw bad("Give the time window a start or an end.");
                c.setStartTime(req.startTime());
                c.setEndTime(req.endTime());
            }
            default -> {
                if (req.value() == null || req.value().isBlank()) throw bad("Describe the condition.");
                c.setValue(req.value().trim());
            }
        }
        conditions.save(c);
        t.touch();
        activity.record(userId, t.getProjectId(), t.getId(), t.getTitle(), Action.UPDATED, ActivityService.diff(before, snapshot(t)));
        return toResponse(t);
    }

    @Transactional
    public TaskResponse removeCondition(Long userId, Long taskId, Long conditionId) {
        Task t = visible(userId, taskId);
        locks.check(userId, taskId);
        access.require(userId, t.getProjectId(), Role.MEMBER);
        TaskCondition c = conditions.findById(conditionId).filter(x -> x.getTaskId().equals(taskId))
                .orElseThrow(() -> new NotFoundException("Condition"));
        Map<String, Object> before = snapshot(t);
        conditions.delete(c);
        conditions.flush();
        t.touch();
        activity.record(userId, t.getProjectId(), t.getId(), t.getTitle(), Action.UPDATED, ActivityService.diff(before, snapshot(t)));
        return toResponse(t);
    }

    /** True if task waits (directly or through others) for target. */
    private boolean dependsOn(Long task, Long target) {
        List<Long> todo = new ArrayList<>(List.of(task));
        java.util.Set<Long> seen = new HashSet<>();
        while (!todo.isEmpty()) {
            Long x = todo.removeLast();
            if (!seen.add(x)) continue;
            for (TaskCondition c : conditions.findByTaskIdOrderByPositionAscIdAsc(x)) {
                if (c.getAfterTaskId() == null) continue;
                if (c.getAfterTaskId().equals(target)) return true;
                todo.add(c.getAfterTaskId());
            }
        }
        return false;
    }

    private static ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    /**
     * Soft delete with its sub-tasks; {@link #restore} undoes it. In a shared project only admins
     * can delete: everyone else can read and change shared tasks, but not remove them.
     */
    @Transactional
    public void delete(Long userId, Long id) {
        Task t = visible(userId, id);
        locks.check(userId, id);
        boolean shared = members.forProject(t.getProjectId()).size() > 1;
        if (shared && access.role(userId, t.getProjectId()) != Role.ADMIN) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only the project's admins can delete tasks in a shared project.");
        }
        access.require(userId, t.getProjectId(), Role.MEMBER);
        Instant now = Instant.now();
        List<Task> all = subtree(t);
        all.forEach(x -> {
            x.setDeletedAt(now);
            x.setState(Task.TodoState.DELETED);
        });
        activity.record(userId, t.getProjectId(), t.getId(), t.getTitle(), Action.DELETED,
                all.size() > 1 ? Map.of("sub-tasks", java.util.Arrays.asList(all.size() - 1, null)) : null);
    }

    @Transactional
    public TaskResponse restore(Long userId, Long id) {
        Task t = tasks.findById(id).filter(x -> x.getDeletedAt() != null)
                .orElseThrow(() -> new NotFoundException("Deleted task"));
        access.require(userId, t.getProjectId(), Role.MEMBER);
        Instant when = t.getDeletedAt();
        List<Task> todo = new ArrayList<>(List.of(t));
        while (!todo.isEmpty()) {
            Task x = todo.removeLast();
            x.setDeletedAt(null);
            if (x.getState() == Task.TodoState.DELETED) x.setState(Task.TodoState.TODO);
            todo.addAll(tasks.deletedChildren(x.getId(), when));
        }
        activity.record(userId, t.getProjectId(), t.getId(), t.getTitle(), Action.RESTORED, null);
        return toResponse(t);
    }

    /** Deleted tasks are kept a week for Undo, then removed for good. Their history stays. */
    @Scheduled(fixedDelay = 3_600_000, initialDelay = 60_000)
    @Transactional
    public void purgeDeleted() {
        tasks.purgeDeletedBefore(Instant.now().minus(Duration.ofDays(7)));
    }

    // ---- history ----

    /** The fields people see, as readable values, so the history can show "before â after". */
    private Map<String, Object> snapshot(Task t) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("title", t.getTitle());
        m.put("description", t.getDescription());
        m.put("priority", "P" + t.getPriority());
        m.put("date", t.getDueDate() == null ? null
                : t.getDueDate() + (t.getDueTime() == null ? "" : " " + t.getDueTime().toString().substring(0, 5)));
        m.put("duration", t.getDurationMinutes() == null ? null : t.getDurationMinutes() + " min");
        m.put("repeat", t.getRecurrence());
        m.put("deadline", t.getDeadline() == null ? null : t.getDeadline().toString());
        m.put("importance", t.getImportance() == null ? null : t.getImportance() + " points");
        m.put("state", t.getState() == Task.TodoState.TODO ? null : t.getState().name());
        m.put("possible times", t.getPossibleTimes() == Task.PossibleTimes.ALL_TIMES ? null : t.getPossibleTimes().name());
        m.put("reason", describeReason(t));
        m.put("notification", t.getNotificationTime() == null ? null : t.getNotificationTime().toString());
        m.put("project", projectRepo.findById(t.getProjectId()).map(Project::getName).orElse(null));
        m.put("assignee", t.getAssigneeId() == null ? null : users.findById(t.getAssigneeId()).map(User::getName).orElse(null));
        m.put("labels", t.getLabels().isEmpty() ? null : t.getLabels().stream().map(Label::getName).sorted().collect(Collectors.joining(", ")));
        m.put("category", t.getCategoryId() == null ? null : categories.findById(t.getCategoryId()).map(Category::getName).orElse(null));
        List<TaskCondition> cs = t.getId() == null ? List.of() : conditions.findByTaskIdOrderByPositionAscIdAsc(t.getId());
        m.put("conditions", cs.isEmpty() ? null : cs.stream()
                .map(c -> c.describe(c.getAfterTaskId() == null ? null : tasks.findById(c.getAfterTaskId()).map(Task::getTitle).orElse(null)))
                .collect(Collectors.joining(", ")));
        return m;
    }

    private void recordUpdate(Long userId, Task t, Map<String, Object> before, boolean wasCompleted, Long fromProject,
                              Boolean completing) {
        Map<String, List<Object>> changes = ActivityService.diff(before, snapshot(t));
        if (Boolean.TRUE.equals(completing) && !wasCompleted) {
            // Completed, or a repeating task moved to its next date.
            changes.remove("date");
            Map<String, List<Object>> c = t.isCompleted() ? null
                    : Map.of("next date", java.util.Arrays.asList(before.get("date"), snapshot(t).get("date")));
            activity.record(userId, t.getProjectId(), t.getId(), t.getTitle(), Action.COMPLETED, c);
        } else if (Boolean.FALSE.equals(completing) && wasCompleted) {
            activity.record(userId, t.getProjectId(), t.getId(), t.getTitle(), Action.REOPENED, null);
        }
        if (!fromProject.equals(t.getProjectId())) {
            Map<String, List<Object>> moved = Map.of("project", changes.remove("project"));
            // The old project's history shows it left; the new one shows it arrived.
            activity.record(userId, fromProject, t.getId(), t.getTitle(), Action.MOVED, moved);
            activity.record(userId, t.getProjectId(), t.getId(), t.getTitle(), Action.MOVED, moved);
        }
        if (Boolean.TRUE.equals(completing) || Boolean.FALSE.equals(completing)) changes.remove("date");
        activity.record(userId, t.getProjectId(), t.getId(), t.getTitle(), Action.UPDATED, changes);
    }

    // ---- the ToDo model: state, reason, notification and why it wasn't done ----

    /** DELETED is what deleting a task sets; asking for it directly is a mistake. */
    private static Task.TodoState liveState(Task.TodoState s) {
        if (s == Task.TodoState.DELETED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Delete the task to give it the DELETED state.");
        }
        return s;
    }

    private static void setReason(Task t, TaskDtos.Reason r) {
        if (r == null) return;
        t.setReasonMoney(r.money());
        t.setReasonHoursPerYear(r.timeToGainInYearByHours());
        t.setReasonEmotional(r.emotionalOnScaleTo10());
    }

    private static TaskDtos.Reason reasonOf(Task t) {
        if (t.getReasonMoney() == null && t.getReasonHoursPerYear() == null && t.getReasonEmotional() == null) return null;
        return new TaskDtos.Reason(t.getReasonMoney(), t.getReasonHoursPerYear(), t.getReasonEmotional());
    }

    private static String describeReason(Task t) {
        List<String> parts = new ArrayList<>();
        if (t.getReasonMoney() != null) parts.add("money " + t.getReasonMoney());
        if (t.getReasonHoursPerYear() != null) parts.add(t.getReasonHoursPerYear() + " h/year");
        if (t.getReasonEmotional() != null) parts.add("emotional " + t.getReasonEmotional() + "/10");
        return parts.isEmpty() ? null : String.join(", ", parts);
    }

    /** Records why the task wasn't done when it was notified (its last notification, or now). */
    @Transactional
    public TaskResponse addNotDone(Long userId, Long taskId, TaskDtos.NotDoneRequest req) {
        Task t = visible(userId, taskId);
        access.require(userId, t.getProjectId(), Role.MEMBER);
        List<String> reasons = req.reasons().stream().map(String::trim).filter(s -> !s.isEmpty()).toList();
        if (reasons.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Give at least one reason.");
        Instant when = t.getNotifiedAt() != null ? t.getNotificationTime() : Instant.now();
        notDone.save(new TaskNotDone(t.getId(), when == null ? Instant.now() : when, reasons, userId));
        t.touch();
        activity.record(userId, t.getProjectId(), t.getId(), t.getTitle(), Action.UPDATED,
                Map.of("not done because", java.util.Arrays.asList(null, String.join(", ", reasons))));
        return toResponse(t);
    }

    @Transactional
    public TaskResponse removeNotDone(Long userId, Long taskId, Long entryId) {
        Task t = visible(userId, taskId);
        access.require(userId, t.getProjectId(), Role.MEMBER);
        TaskNotDone e = notDone.findById(entryId).filter(x -> x.getTaskId().equals(taskId))
                .orElseThrow(() -> new NotFoundException("Entry"));
        notDone.delete(e);
        return toResponse(t);
    }

    // ---- helpers ----

    /** A live task in a project the user belongs to. */
    Task visible(Long userId, Long id) {
        Task t = tasks.findLive(id).orElseThrow(() -> new NotFoundException("Task"));
        if (!access.isMember(userId, t.getProjectId())) throw new NotFoundException("Task");
        return t;
    }

    private Category ownCategory(Long userId, Long categoryId) {
        return categories.findByIdAndOwnerId(categoryId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "That category isnât one of yours."));
    }

    private void complete(Task t, boolean completed, LocalDate today) {
        if (completed && t.getRecurrence() != null) {
            // A repeating task moves to its next date instead of being completed.
            LocalDate next = Recurrence.advance(t.getRecurrence(), t.getDueDate(), today);
            if (next != null) {
                t.setDueDate(next);
                return;
            }
        }
        if (completed) {
            subtree(t).forEach(x -> {
                if (!x.isCompleted()) x.setCompleted(true);
            });
        } else {
            t.setCompleted(false);
        }
    }

    private void move(Long userId, Task t, Long projectId) {
        access.require(userId, t.getProjectId(), Role.MEMBER);
        access.require(userId, projectId, Role.MEMBER);
        t.setParentId(null); // a moved sub-task becomes a top-level task in its new project
        t.setPosition(tasks.countInProject(projectId));
        for (Task x : subtree(t)) {
            x.setProjectId(projectId);
            if (x.getAssigneeId() != null && !access.isMember(x.getAssigneeId(), projectId)) x.setAssigneeId(null);
        }
    }

    private void assign(Long userId, Task t, Long assigneeId) {
        if (!access.isMember(assigneeId, t.getProjectId())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only people in this project can be assigned.");
        }
        t.setAssigneeId(assigneeId);
        notifications.assigned(assigneeId, users.findById(userId).orElseThrow(), t);
    }

    private List<Task> subtree(Task root) {
        List<Task> out = new ArrayList<>();
        List<Task> todo = new ArrayList<>(List.of(root));
        while (!todo.isEmpty()) {
            Task x = todo.removeLast();
            out.add(x);
            todo.addAll(tasks.children(x.getId()));
        }
        return out;
    }

    private int depth(Task t) {
        int d = 1;
        Long p = t.getParentId();
        while (p != null && d <= MAX_DEPTH) {
            d++;
            p = tasks.findById(p).map(Task::getParentId).orElse(null);
        }
        return d;
    }

    private static void validateRecurrence(String rule) {
        if (!Recurrence.isValid(rule)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "â" + rule + "â isn't a repeat Doable understands. "
                    + "Try âevery dayâ, âevery weekdayâ, âevery mondayâ or âevery 2 weeksâ.");
        }
    }

    private static LocalDate today(UpdateTaskRequest req) {
        return req.today() == null ? LocalDate.now() : req.today();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    TaskResponse toResponse(Task t) {
        return toResponses(List.of(t)).getFirst();
    }

    /** Builds responses with counts, labels, categories and people looked up in a few batch queries. */
    List<TaskResponse> toResponses(List<Task> list) {
        if (list.isEmpty()) return List.of();
        List<Long> ids = list.stream().map(Task::getId).toList();
        Map<Long, int[]> subs = new HashMap<>();
        for (Object[] r : tasks.subtaskCounts(ids)) {
            subs.put((Long) r[0], new int[]{((Long) r[1]).intValue(), ((Number) r[2]).intValue()});
        }
        Map<Long, Long> commentCounts = comments.countByTask(ids);
        Map<Long, User> people = users.byIds(list.stream()
                .flatMap(t -> Stream.of(t.getAssigneeId(), t.getCreatedBy())).filter(Objects::nonNull)
                .distinct().toList());
        List<Long> categoryIds = list.stream().map(Task::getCategoryId).filter(Objects::nonNull).distinct().toList();
        Map<Long, Category> cats = categoryIds.isEmpty() ? Map.of() : categories.findAllById(categoryIds).stream()
                .collect(Collectors.toMap(Category::getId, Function.identity()));
        Map<Long, List<TaskCondition>> conds = conditions.findByTaskIdInOrderByPositionAscIdAsc(ids).stream()
                .collect(Collectors.groupingBy(TaskCondition::getTaskId));
        List<Long> afterIds = conds.values().stream().flatMap(List::stream).map(TaskCondition::getAfterTaskId)
                .filter(Objects::nonNull).distinct().toList();
        Map<Long, List<TaskDtos.NotDoneRef>> notDoneByTask = notDone.findByTaskIdInOrderByIdAsc(ids).stream()
                .collect(Collectors.groupingBy(TaskNotDone::getTaskId, Collectors.mapping(
                        n -> new TaskDtos.NotDoneRef(n.getId(), n.getNotificationTime(), n.getReasons(), n.getCreatedAt()),
                        Collectors.toList())));
        Map<Long, Task> afters = afterIds.isEmpty() ? Map.of() : tasks.findAllById(afterIds).stream()
                .collect(Collectors.toMap(Task::getId, Function.identity()));
        return list.stream().map(t -> {
            int[] s = subs.getOrDefault(t.getId(), new int[]{0, 0});
            Category c = t.getCategoryId() == null ? null : cats.get(t.getCategoryId());
            return new TaskResponse(t.getId(), t.getProjectId(), t.getParentId(), t.getTitle(), t.getDescription(),
                    t.getPriority(), t.getDueDate(), t.getDueTime(), t.getDurationMinutes(), t.getRecurrence(),
                    t.isCompleted(), t.getCompletedAt(), t.getPosition(), t.getCreatedAt(),
                    person(people.get(t.getCreatedBy())), person(people.get(t.getAssigneeId())),
                    t.getLabels().stream().sorted(Comparator.comparing(Label::getName, String.CASE_INSENSITIVE_ORDER))
                            .map(l -> new LabelRef(l.getId(), l.getName(), l.getColor())).toList(),
                    s[0], s[1], commentCounts.getOrDefault(t.getId(), 0L).intValue(),
                    c == null ? null : new CategoryRef(c.getId(), c.getName(), c.getColor()), t.getDeadline(),
                    t.getUpdatedAt(), t.getCategoryPosition(),
                    conds.getOrDefault(t.getId(), List.of()).stream().map(x -> {
                        Task after = x.getAfterTaskId() == null ? null : afters.get(x.getAfterTaskId());
                        // A deleted task no longer holds anything up.
                        boolean met = after == null || after.isCompleted() || after.getDeletedAt() != null;
                        String title = after == null ? null : after.getTitle();
                        return new TaskDtos.ConditionRef(x.getId(), x.getType(), x.getValue(), x.getAfterTaskId(), title,
                                x.getStartTime(), x.getEndTime(), x.describe(title), met);
                    }).toList(), t.getImportance(),
                    t.getState(), t.getPossibleTimes(), reasonOf(t), t.getNotificationTime(), t.getNotifiedAt(),
                    notDoneByTask.getOrDefault(t.getId(), List.of()));
        }).toList();
    }

    private static PersonRef person(User u) {
        return u == null ? null : new PersonRef(u.getId(), u.getName(), User.initials(u.getName()));
    }

    /** For the project tools (duplicate, export). */
    List<Task> openTree(Long projectId) {
        List<Task> out = new ArrayList<>();
        for (Task top : tasks.openTopLevel(projectId).stream().sorted(MANUAL).toList()) {
            for (Task x : subtree(top)) if (!x.isCompleted()) out.add(x);
        }
        return out;
    }

    Project requireProject(Long userId, Long projectId, Role role) {
        return access.require(userId, projectId, role);
    }
}
