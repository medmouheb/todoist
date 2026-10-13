package com.doable.user;

import com.doable.auth.AuthDtos.UserResponse;
import com.doable.comment.CommentRepository;
import com.doable.label.LabelController.LabelResponse;
import com.doable.label.LabelRepository;
import com.doable.project.ProjectDtos.ProjectResponse;
import com.doable.project.ProjectService;
import com.doable.task.Task;
import com.doable.task.TaskRepository;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Everything a person can see, as one JSON document. */
@Service
public class ExportService {

    private final UserRepository users;
    private final ProjectService projects;
    private final TaskRepository tasks;
    private final LabelRepository labels;
    private final CommentRepository comments;

    public ExportService(UserRepository users, ProjectService projects, TaskRepository tasks, LabelRepository labels,
                         CommentRepository comments) {
        this.users = users;
        this.projects = projects;
        this.tasks = tasks;
        this.labels = labels;
        this.comments = comments;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> export(Long userId) {
        List<ProjectResponse> ps = projects.list(userId);
        List<Task> ts = ps.isEmpty() ? List.of()
                : tasks.findByProjectIdInAndDeletedAtIsNullOrderById(ps.stream().map(ProjectResponse::id).toList());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("exportedAt", Instant.now());
        out.put("user", UserResponse.of(users.findById(userId).orElseThrow()));
        out.put("labels", labels.findByOwnerIdOrderByNameAsc(userId).stream().map(LabelResponse::of).toList());
        out.put("projects", ps);
        out.put("tasks", ts.stream().map(t -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", t.getId());
            m.put("projectId", t.getProjectId());
            m.put("parentId", t.getParentId());
            m.put("title", t.getTitle());
            m.put("description", t.getDescription());
            m.put("priority", t.getPriority());
            m.put("dueDate", t.getDueDate());
            m.put("dueTime", t.getDueTime());
            m.put("durationMinutes", t.getDurationMinutes());
            m.put("recurrence", t.getRecurrence());
            m.put("completed", t.isCompleted());
            m.put("completedAt", t.getCompletedAt());
            m.put("assigneeId", t.getAssigneeId());
            m.put("labels", t.getLabels().stream().map(l -> l.getName()).toList());
            m.put("comments", comments.findByTaskIdOrderByCreatedAtAsc(t.getId()).stream()
                    .map(c -> Map.of("authorId", c.getAuthorId(), "body", c.getBody(), "createdAt", c.getCreatedAt()))
                    .toList());
            m.put("createdAt", t.getCreatedAt());
            return m;
        }).toList());
        return out;
    }
}
