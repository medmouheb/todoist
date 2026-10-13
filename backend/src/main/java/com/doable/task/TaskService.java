package com.doable.task;

import com.doable.common.NotFoundException;
import com.doable.project.Project;
import com.doable.project.ProjectService;
import com.doable.task.TaskDtos.CreateTaskRequest;
import com.doable.task.TaskDtos.TaskResponse;
import com.doable.task.TaskDtos.UpdateTaskRequest;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TaskService {

    /** Dated tasks first by date, then by priority, then in the order they were added. */
    private static final Comparator<Task> ORDER = Comparator
            .comparing(Task::getDueDate, Comparator.nullsLast(Comparator.naturalOrder()))
            .thenComparing(Task::getPriority)
            .thenComparing(Task::getPosition)
            .thenComparing(Task::getId);

    private final TaskRepository tasks;
    private final ProjectService projects;

    public TaskService(TaskRepository tasks, ProjectService projects) {
        this.tasks = tasks;
        this.projects = projects;
    }

    /**
     * @param today the user's local date, sent by the client so "Today" follows their time zone
     */
    @Transactional(readOnly = true)
    public List<TaskResponse> view(Long ownerId, String view, LocalDate today) {
        List<Task> found = switch (view) {
            case "inbox" -> tasks.findByOwnerIdAndProjectIdAndCompletedFalse(ownerId, projects.inbox(ownerId).getId());
            case "today" -> tasks.findByOwnerIdAndCompletedFalseAndDueDateLessThanEqual(ownerId, today);
            case "upcoming" -> tasks.findByOwnerIdAndCompletedFalseAndDueDateGreaterThanEqual(ownerId, today);
            default -> throw new NotFoundException("View '" + view + "'");
        };
        return sorted(found);
    }

    @Transactional(readOnly = true)
    public List<TaskResponse> byProject(Long ownerId, Long projectId, boolean completed) {
        Project p = projects.get(ownerId, projectId);
        if (completed) {
            return tasks.findByOwnerIdAndProjectIdAndCompletedTrueOrderByCompletedAtDesc(ownerId, p.getId())
                    .stream().map(TaskResponse::of).toList();
        }
        return sorted(tasks.findByOwnerIdAndProjectIdAndCompletedFalse(ownerId, p.getId()));
    }

    @Transactional
    public TaskResponse create(Long ownerId, CreateTaskRequest req) {
        Project p = req.projectId() == null ? projects.inbox(ownerId) : projects.get(ownerId, req.projectId());
        Task t = new Task(ownerId, p.getId(), req.title().trim());
        t.setDescription(blankToNull(req.description()));
        if (req.priority() != null) {
            t.setPriority(req.priority());
        }
        t.setDueDate(req.dueDate());
        t.setPosition(tasks.countByProjectId(p.getId()));
        return TaskResponse.of(tasks.save(t));
    }

    @Transactional
    public TaskResponse update(Long ownerId, Long id, UpdateTaskRequest req) {
        Task t = get(ownerId, id);
        if (req.title() != null) {
            t.setTitle(req.title().trim());
        }
        if (req.description() != null) {
            t.setDescription(blankToNull(req.description()));
        }
        if (req.priority() != null) {
            t.setPriority(req.priority());
        }
        if (Boolean.TRUE.equals(req.clearDueDate())) {
            t.setDueDate(null);
        } else if (req.dueDate() != null) {
            t.setDueDate(req.dueDate());
        }
        if (req.projectId() != null) {
            t.setProjectId(projects.get(ownerId, req.projectId()).getId());
        }
        if (req.completed() != null && req.completed() != t.isCompleted()) {
            t.setCompleted(req.completed());
        }
        return TaskResponse.of(t);
    }

    @Transactional
    public void delete(Long ownerId, Long id) {
        tasks.delete(get(ownerId, id));
    }

    private Task get(Long ownerId, Long id) {
        return tasks.findByIdAndOwnerId(id, ownerId).orElseThrow(() -> new NotFoundException("Task"));
    }

    private static List<TaskResponse> sorted(List<Task> list) {
        return list.stream().sorted(ORDER).map(TaskResponse::of).toList();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
