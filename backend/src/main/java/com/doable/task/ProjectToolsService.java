package com.doable.task;

import com.doable.label.Label;
import com.doable.label.LabelService;
import com.doable.project.Project;
import com.doable.project.ProjectDtos.ProjectRequest;
import com.doable.project.ProjectDtos.ProjectResponse;
import com.doable.project.ProjectService;
import com.doable.project.Role;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/** Duplicate a project, and save it as / fill it from a CSV template. */
@Service
public class ProjectToolsService {

    static final String[] HEADER = {"title", "description", "priority", "due_date", "due_time", "duration_minutes",
            "recurrence", "labels", "indent"};

    private final TaskService taskService;
    private final TaskRepository tasks;
    private final ProjectService projects;
    private final LabelService labels;
    private final com.doable.activity.ActivityService activity;

    public ProjectToolsService(TaskService taskService, TaskRepository tasks, ProjectService projects,
                               LabelService labels, com.doable.activity.ActivityService activity) {
        this.activity = activity;
        this.taskService = taskService;
        this.tasks = tasks;
        this.projects = projects;
        this.labels = labels;
    }

    /** A new project, owned by the caller, with copies of the open tasks (structure and labels kept, no assignees). */
    @Transactional
    public ProjectResponse duplicate(Long userId, Long projectId) {
        Project src = taskService.requireProject(userId, projectId, Role.GUEST);
        String name = src.isInbox() ? "Inbox (copy)" : src.getName() + " (copy)";
        ProjectResponse copy = projects.create(userId,
                new ProjectRequest(name.length() > 120 ? name.substring(0, 120) : name, src.getColor(), false, null));
        Map<Long, Long> newIds = new HashMap<>();
        for (Task t : taskService.openTree(projectId)) {
            Task c = new Task(userId, copy.id(), t.getTitle());
            c.setParentId(t.getParentId() == null ? null : newIds.get(t.getParentId()));
            c.setDescription(t.getDescription());
            c.setPriority(t.getPriority());
            c.setDueDate(t.getDueDate());
            c.setDueTime(t.getDueTime());
            c.setDurationMinutes(t.getDurationMinutes());
            c.setRecurrence(t.getRecurrence());
            c.setPosition(t.getPosition());
            c.getLabels().addAll(t.getLabels());
            newIds.put(t.getId(), tasks.save(c).getId());
        }
        return projects.get(userId, copy.id());
    }

    @Transactional(readOnly = true)
    public String exportCsv(Long userId, Long projectId) {
        taskService.requireProject(userId, projectId, Role.GUEST);
        List<Task> tree = taskService.openTree(projectId);
        Map<Long, Integer> indent = new HashMap<>();
        StringBuilder sb = new StringBuilder(Csv.row((Object[]) HEADER));
        for (Task t : tree) {
            int level = t.getParentId() == null ? 1 : indent.getOrDefault(t.getParentId(), 0) + 1;
            indent.put(t.getId(), level);
            sb.append(Csv.row(t.getTitle(), t.getDescription(), t.getPriority(), t.getDueDate(), t.getDueTime(),
                    t.getDurationMinutes(), t.getRecurrence(),
                    String.join(" ", t.getLabels().stream().map(Label::getName).toList()), level));
        }
        return sb.toString();
    }

    /** Adds the CSV's rows as tasks; "indent" 2+ makes a row a sub-task of the row above it. */
    @Transactional
    public int importCsv(Long userId, Long projectId, String csv) {
        taskService.requireProject(userId, projectId, Role.MEMBER);
        List<List<String>> rows = Csv.parse(csv);
        if (rows.isEmpty()) return 0;
        List<String> header = rows.getFirst().stream().map(h -> h.trim().toLowerCase()).toList();
        int titleCol = header.indexOf("title");
        if (titleCol < 0) titleCol = header.indexOf("content"); // Todoist exports call it CONTENT
        if (titleCol < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "The CSV needs a header row with a “title” column. Columns: " + String.join(", ", HEADER));
        }
        List<Long> stack = new ArrayList<>(); // stack.get(i) = last task at indent i+1
        int position = tasks.countInProject(projectId);
        int added = 0;
        for (int r = 1; r < rows.size(); r++) {
            List<String> row = rows.get(r);
            String title = cell(row, titleCol);
            if (title.isBlank()) continue;
            try {
                Task t = new Task(userId, projectId, title.length() > 500 ? title.substring(0, 500) : title);
                t.setDescription(blankToNull(cell(row, header.indexOf("description"))));
                String p = cell(row, header.indexOf("priority"));
                if (!p.isBlank()) t.setPriority((short) Math.max(1, Math.min(4, Integer.parseInt(p.trim()))));
                String d = cell(row, header.indexOf("due_date"));
                if (!d.isBlank()) t.setDueDate(LocalDate.parse(d.trim()));
                String tm = cell(row, header.indexOf("due_time"));
                if (!tm.isBlank() && t.getDueDate() != null) t.setDueTime(LocalTime.parse(tm.trim()));
                String dur = cell(row, header.indexOf("duration_minutes"));
                if (!dur.isBlank() && t.getDueDate() != null) t.setDurationMinutes(Integer.parseInt(dur.trim()));
                String rec = cell(row, header.indexOf("recurrence"));
                if (!rec.isBlank() && Recurrence.isValid(rec)) t.setRecurrence(Recurrence.normalize(rec));
                String lbl = cell(row, header.indexOf("labels"));
                if (!lbl.isBlank()) t.getLabels().addAll(labels.resolve(userId, Arrays.asList(lbl.trim().split("[\\s,]+"))));
                String ind = cell(row, header.indexOf("indent"));
                int level = ind.isBlank() ? 1 : Math.max(1, Math.min(TaskService.MAX_DEPTH, Integer.parseInt(ind.trim())));
                level = Math.min(level, stack.size() + 1);
                if (level > 1) t.setParentId(stack.get(level - 2));
                t.setPosition(position++);
                Long id = tasks.save(t).getId();
                while (stack.size() >= level) stack.removeLast();
                stack.add(id);
                added++;
            } catch (RuntimeException e) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Row " + (r + 1) + " (“" + title + "”) couldn't be read: dates are YYYY-MM-DD, times HH:MM, "
                                + "priority 1–4.");
            }
        }
        if (added > 0) {
            activity.record(userId, projectId, null, null, com.doable.activity.ActivityService.Action.IMPORTED,
                    java.util.Map.<String, java.util.List<Object>>of("tasks", java.util.Arrays.asList(null, added)));
        }
        return added;
    }

    private static String cell(List<String> row, int col) {
        return col < 0 || col >= row.size() || row.get(col) == null ? "" : row.get(col);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
