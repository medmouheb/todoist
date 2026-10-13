package com.doable.task;

import com.doable.comment.CommentRepository;
import com.doable.common.NotFoundException;
import com.doable.label.Label;
import com.doable.label.LabelService;
import com.doable.notification.NotificationService;
import com.doable.project.Project;
import com.doable.project.ProjectAccess;
import com.doable.project.ProjectService;
import com.doable.project.Role;
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
import java.util.List;
import java.util.Map;
import java.util.Objects;
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

    /** Dated tasks first by date and time, then by priority, then in the order they were added. */
    private static final Comparator<Task> ORDER = Comparator
            .comparing(Task::getDueDate, Comparator.nullsLast(Comparator.naturalOrder()))
            .thenComparing(Task::getDueTime, Comparator.nullsLast(Comparator.naturalOrder()))
            .thenComparing(Task::getPriority)
            .thenComparing(Task::getPosition)
            .thenComparing(Task::getId);

    private final TaskRepository tasks;
    private final ProjectService projects;
    private final ProjectAccess access;
    private final LabelService labels;
    private final CommentRepository comments;
    private final UserRepository users;
    private final NotificationService notifications;

    public TaskService(TaskRepository tasks, ProjectService projects, ProjectAccess access, LabelService labels,
                       CommentRepository comments, UserRepository users, NotificationService notifications) {
        this.tasks = tasks;
        this.projects = projects;
        this.access = access;
        this.labels = labels;
        this.comments = comments;
        this.users = users;
        this.notifications = notifications;
    }

    // ---- reading ----

    /**
     * @param today the user's local date, sent by the client so "Today" follows their time zone
     */
    @Transactional(readOnly = true)
    public List<TaskResponse> view(Long userId, String view, LocalDate today) {
        List<Long> active = access.projectIds(userId, true);
        List<Task> found = switch (view) {
            case "inbox" -> tasks.openTopLevel(projects.inbox(userId).getId());
            case "today" -> active.isEmpty() ? List.of() : tasks.dueOnOrBefore(active, today, userId);
            case "upcoming" -> active.isEmpty() ? List.of() : tasks.dueOnOrAfter(active, today, userId);
            default -> throw new NotFoundException("View '" + view + "'");
        };
        return toResponses(found.stream().sorted(ORDER).toList());
    }

    @Transactional(readOnly = true)
    public List<TaskResponse> byProject(Long userId, Long projectId) {
        access.require(userId, projectId, Role.GUEST);
        return toResponses(tasks.openTopLevel(projectId).stream().sorted(ORDER).toList());
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

    /** Direct sub-tasks, open ones first. */
    @Transactional(readOnly = true)
    public List<TaskResponse> subtasks(Long userId, Long parentId) {
        visible(userId, parentId);
        return toResponses(tasks.children(parentId).stream()
                .sorted(Comparator.comparing(Task::isCompleted).thenComparing(Task::getPosition)
                        .thenComparing(Task::getId))
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
        t.setPosition(tasks.countInProject(projectId));
        tasks.save(t);
        if (req.assigneeId() != null) assign(userId, t, req.assigneeId());
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
                && req.clearRecurrence() == null;
        boolean guestOwnTask = role == Role.GUEST && onlyCompleting && userId.equals(t.getAssigneeId());
        if (!role.atLeast(Role.MEMBER) && !guestOwnTask) {
            access.require(userId, t.getProjectId(), Role.MEMBER); // throws the 403
        }

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
        return toResponse(t);
    }

    /** Soft delete with its sub-tasks; {@link #restore} undoes it. */
    @Transactional
    public void delete(Long userId, Long id) {
        Task t = visible(userId, id);
        access.require(userId, t.getProjectId(), Role.MEMBER);
        Instant now = Instant.now();
        subtree(t).forEach(x -> x.setDeletedAt(now));
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
        return toResponse(t);
    }

    /** Deleted tasks are kept a week for Undo, then removed for good. */
    @Scheduled(fixedDelay = 3_600_000, initialDelay = 60_000)
    @Transactional
    public void purgeDeleted() {
        tasks.purgeDeletedBefore(Instant.now().minus(Duration.ofDays(7)));
    }

    // ---- helpers ----

    /** A live task in a project the user belongs to. */
    Task visible(Long userId, Long id) {
        Task t = tasks.findLive(id).orElseThrow(() -> new NotFoundException("Task"));
        if (!access.isMember(userId, t.getProjectId())) throw new NotFoundException("Task");
        return t;
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

    /** Builds responses with counts, labels and people looked up in a few batch queries. */
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
        return list.stream().map(t -> {
            int[] s = subs.getOrDefault(t.getId(), new int[]{0, 0});
            return new TaskResponse(t.getId(), t.getProjectId(), t.getParentId(), t.getTitle(), t.getDescription(),
                    t.getPriority(), t.getDueDate(), t.getDueTime(), t.getDurationMinutes(), t.getRecurrence(),
                    t.isCompleted(), t.getCompletedAt(), t.getPosition(), t.getCreatedAt(),
                    person(people.get(t.getCreatedBy())), person(people.get(t.getAssigneeId())),
                    t.getLabels().stream().sorted(Comparator.comparing(Label::getName, String.CASE_INSENSITIVE_ORDER))
                            .map(l -> new LabelRef(l.getId(), l.getName(), l.getColor())).toList(),
                    s[0], s[1], commentCounts.getOrDefault(t.getId(), 0L).intValue());
        }).toList();
    }

    private static PersonRef person(User u) {
        return u == null ? null : new PersonRef(u.getId(), u.getName(), User.initials(u.getName()));
    }

    /** For the project tools (duplicate, export). */
    List<Task> openTree(Long projectId) {
        List<Task> out = new ArrayList<>();
        for (Task top : tasks.openTopLevel(projectId).stream().sorted(ORDER).toList()) {
            for (Task x : subtree(top)) if (!x.isCompleted()) out.add(x);
        }
        return out;
    }

    Project requireProject(Long userId, Long projectId, Role role) {
        return access.require(userId, projectId, role);
    }
}
