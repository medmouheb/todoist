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

    public TaskService(TaskRepository tasks, ProjectService projects, ProjectRepository projectRepo, ProjectAccess access,
                       LabelService labels, CommentRepository comments, CategoryRepository categories,
                       UserRepository users, NotificationService notifications, ActivityService activity) {
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
        if (t.getDueDate() != null) {
            t.setDueTime(req.dueTime());
            t.setDurationMinutes(req.durationMinutes());
        }
        if (req.labels() != null) t.getLabels().addAll(labels.resolve(userId, req.labels()));
        if (req.categoryId() != null) t.setCategoryId(ownCategory(userId, req.categoryId()).getId());
        t.setDeadline(req.deadline());
        t.setPosition(tasks.countInProject(projectId));
        tasks.save(t);
        if (req.assigneeId() != null) assign(userId, t, req.assigneeId());
        activity.record(userId, projectId, t.getId(), t.getTitle(), Action.CREATED, null);
        return toResponse(t);
    }

    @Transactional
    public TaskResponse update(Long userId, Long id, UpdateTaskRequest req) {
        Task t = visible(userId, id);
        Role role = access.role(userId, t.getProjectId());
        boolean onlyCompleting = req.completed() != null && req.title() == null && req.description() == null
                && req.priority() == null && req.dueDate() == null && req.dueTime() == null
                && req.durationMinutes() == null && req.recurrence() == null && req.projectId() == null
                && req.assigneeId() == null && req.labels() == null && req.clearDueDate() == null
                && req.clearAssignee() == null && req.clearDueTime() == null && req.clearDuration() == null
                && req.clearRecurrence() == null && req.categoryId() == null && req.clearCategory() == null
                && req.deadline() == null && req.clearDeadline() == null;
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
            t.setDurationMinutes(null);
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
            if (req.durationMinutes() != null) t.setDurationMinutes(req.durationMinutes());
            if (Boolean.TRUE.equals(req.clearDuration())) t.setDurationMinutes(null);
        }

        if (req.labels() != null) {
            t.getLabels().clear();
            t.getLabels().addAll(labels.resolve(userId, req.labels()));
        }
        if (Boolean.TRUE.equals(req.clearCategory())) t.setCategoryId(null);
        else if (req.categoryId() != null) t.setCategoryId(ownCategory(userId, req.categoryId()).getId());
        if (Boolean.TRUE.equals(req.clearDeadline())) t.setDeadline(null);
        else if (req.deadline() != null) t.setDeadline(req.deadline());

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

    /** Soft delete with its sub-tasks; {@link #restore} undoes it. */
    @Transactional
    public void delete(Long userId, Long id) {
        Task t = visible(userId, id);
        access.require(userId, t.getProjectId(), Role.MEMBER);
        Instant now = Instant.now();
        List<Task> all = subtree(t);
        all.forEach(x -> x.setDeletedAt(now));
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

    /** The fields people see, as readable values, so the history can show "before → after". */
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
        m.put("project", projectRepo.findById(t.getProjectId()).map(Project::getName).orElse(null));
        m.put("assignee", t.getAssigneeId() == null ? null : users.findById(t.getAssigneeId()).map(User::getName).orElse(null));
        m.put("labels", t.getLabels().isEmpty() ? null : t.getLabels().stream().map(Label::getName).sorted().collect(Collectors.joining(", ")));
        m.put("category", t.getCategoryId() == null ? null : categories.findById(t.getCategoryId()).map(Category::getName).orElse(null));
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

    // ---- helpers ----

    /** A live task in a project the user belongs to. */
    Task visible(Long userId, Long id) {
        Task t = tasks.findLive(id).orElseThrow(() -> new NotFoundException("Task"));
        if (!access.isMember(userId, t.getProjectId())) throw new NotFoundException("Task");
        return t;
    }

    private Category ownCategory(Long userId, Long categoryId) {
        return categories.findByIdAndOwnerId(categoryId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "That category isn’t one of yours."));
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
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "“" + rule + "” isn't a repeat Doable understands. "
                    + "Try “every day”, “every weekday”, “every monday” or “every 2 weeks”.");
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
                    c == null ? null : new CategoryRef(c.getId(), c.getName(), c.getColor()), t.getDeadline());
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
