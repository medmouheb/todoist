package com.doable.comment;

import com.doable.common.CurrentUser;
import com.doable.common.NotFoundException;
import com.doable.notification.NotificationService;
import com.doable.project.ProjectAccess;
import com.doable.project.ProjectMember;
import com.doable.project.ProjectMemberRepository;
import com.doable.task.Task;
import com.doable.task.TaskRepository;
import com.doable.user.User;
import com.doable.user.UserRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** Comments on a task. Every project member, guests included, can read and write them. */
@RestController
public class CommentController {

    public record CommentRequest(@NotBlank @Size(max = 5000) String body) {
    }

    public record CommentResponse(Long id, Long taskId, Long authorId, String authorName, String authorInitials,
                                  String body, Instant createdAt) {
    }

    private final CommentRepository comments;
    private final TaskRepository tasks;
    private final ProjectAccess access;
    private final ProjectMemberRepository members;
    private final UserRepository users;
    private final NotificationService notifications;

    public CommentController(CommentRepository comments, TaskRepository tasks, ProjectAccess access,
                             ProjectMemberRepository members, UserRepository users,
                             NotificationService notifications) {
        this.comments = comments;
        this.tasks = tasks;
        this.access = access;
        this.members = members;
        this.users = users;
        this.notifications = notifications;
    }

    @GetMapping("/api/tasks/{taskId}/comments")
    @Transactional(readOnly = true)
    public List<CommentResponse> list(@AuthenticationPrincipal Jwt jwt, @PathVariable Long taskId) {
        task(CurrentUser.id(jwt), taskId);
        List<Comment> found = comments.findByTaskIdOrderByCreatedAtAsc(taskId);
        Map<Long, User> authors = users.byIds(found.stream().map(Comment::getAuthorId).distinct().toList());
        return found.stream().map(c -> toResponse(c, authors.get(c.getAuthorId()))).toList();
    }

    @PostMapping("/api/tasks/{taskId}/comments")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public CommentResponse add(@AuthenticationPrincipal Jwt jwt, @PathVariable Long taskId,
                               @Valid @RequestBody CommentRequest req) {
        long userId = CurrentUser.id(jwt);
        Task t = task(userId, taskId);
        User author = users.findById(userId).orElseThrow();
        Comment c = comments.save(new Comment(taskId, userId, req.body().trim()));
        notifications.commented(author, t, c.getBody(), mentions(c.getBody(), t.getProjectId()));
        return toResponse(c, author);
    }

    @DeleteMapping("/api/comments/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id) {
        Comment c = comments.findById(id).orElseThrow(() -> new NotFoundException("Comment"));
        task(CurrentUser.id(jwt), c.getTaskId());
        if (!c.getAuthorId().equals(CurrentUser.id(jwt))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You can only delete your own comments.");
        }
        comments.delete(c);
    }

    /**
     * Members named with @ in the text: "@Maya" matches a member whose first name is Maya,
     * "@maya.andersen" or "@Maya_Andersen" match the full name.
     */
    private Set<Long> mentions(String body, Long projectId) {
        Set<Long> out = new LinkedHashSet<>();
        String text = body.toLowerCase(Locale.ROOT);
        List<Long> ids = members.forProject(projectId).stream().map(ProjectMember::getUserId).toList();
        for (User u : users.byIds(ids).values()) {
            String full = u.getName().toLowerCase(Locale.ROOT);
            String first = full.split("\\s+")[0];
            for (String handle : List.of(first, full.replaceAll("\\s+", "."), full.replaceAll("\\s+", "_"))) {
                if (text.matches("(?s).*(^|\\s)@" + java.util.regex.Pattern.quote(handle) + "(\\b.*|$)")) {
                    out.add(u.getId());
                }
            }
        }
        return out;
    }

    private Task task(Long userId, Long taskId) {
        Task t = tasks.findLive(taskId).orElseThrow(() -> new NotFoundException("Task"));
        if (!access.isMember(userId, t.getProjectId())) throw new NotFoundException("Task");
        return t;
    }

    private static CommentResponse toResponse(Comment c, User author) {
        return new CommentResponse(c.getId(), c.getTaskId(), c.getAuthorId(),
                author == null ? "Former member" : author.getName(),
                author == null ? "?" : User.initials(author.getName()), c.getBody(), c.getCreatedAt());
    }
}
