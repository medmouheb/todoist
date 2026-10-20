package com.doable.notification;

import com.doable.notification.Notification.Type;
import com.doable.project.Project;
import com.doable.project.ProjectInvite;
import com.doable.project.ProjectInviteRepository;
import com.doable.project.ProjectRepository;
import com.doable.realtime.RealtimeService;
import com.doable.task.Task;
import com.doable.user.User;
import com.doable.user.UserRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Creates notifications and pushes each one live to the person's open tabs. */
@Service
public class NotificationService {

    /** Activity by the same person on the same task within this window becomes one notification. */
    private static final Duration MERGE_WINDOW = Duration.ofMinutes(10);

    public record NotificationResponse(Long id, Type type, String message, Long actorId, String actorName,
                                       String actorInitials,
                                       Long projectId, Long taskId, Long inviteId, boolean read, Instant createdAt) {
    }

    public record NotificationList(long unread, List<NotificationResponse> items) {
    }

    /** What the browser receives on the "notification" event. */
    public record LiveNotification(Long id, Type type, String message, Long projectId, Long taskId) {
    }

    private final NotificationRepository notifications;
    private final ProjectInviteRepository invites;
    private final ProjectRepository projects;
    private final UserRepository users;
    private final RealtimeService realtime;

    public NotificationService(NotificationRepository notifications, ProjectInviteRepository invites,
                               ProjectRepository projects, UserRepository users, RealtimeService realtime) {
        this.notifications = notifications;
        this.invites = invites;
        this.projects = projects;
        this.users = users;
        this.realtime = realtime;
    }

    @Transactional(readOnly = true)
    public NotificationList list(Long userId) {
        List<Notification> items = notifications.findByUserIdOrderByCreatedAtDesc(userId, Limit.of(50));
        Map<Long, User> actors = users.byIds(items.stream().map(Notification::getActorId)
                .filter(Objects::nonNull).distinct().toList());
        return new NotificationList(notifications.countByUserIdAndReadAtIsNull(userId), items.stream().map(n -> {
            User a = n.getActorId() == null ? null : actors.get(n.getActorId());
            return new NotificationResponse(n.getId(), n.getType(), n.getMessage(), n.getActorId(),
                    a == null ? null : a.getName(), a == null ? null : User.initials(a.getName()),
                    n.getProjectId(), n.getTaskId(), n.getInviteId(), n.getReadAt() != null, n.getCreatedAt());
        }).toList());
    }

    @Transactional
    public void markRead(Long userId, Long id) {
        notifications.findByIdAndUserId(id, userId).ifPresent(Notification::markRead);
    }

    @Transactional
    public void markAllRead(Long userId) {
        notifications.markAllRead(userId);
    }

    public void invited(Long inviteeId, User inviter, Project p, ProjectInvite invite) {
        save(new Notification(inviteeId, Type.INVITE, inviter.getId(), p.getId(), null, invite.getId(),
                inviter.getName() + " invited you to “" + p.getName() + "” as " + invite.getRole().label()
                        + ": you’ll be able to " + invite.getRole().permissions() + "."));
    }

    /** A new account picks up invites that were sent to its email before it existed. */
    public void pendingInvitesFor(User user) {
        for (ProjectInvite i : invites.findByEmailIgnoreCaseOrderByCreatedAtDesc(user.getEmail())) {
            Project p = projects.findById(i.getProjectId()).orElse(null);
            User inviter = users.findById(i.getInvitedBy()).orElse(null);
            if (p != null && inviter != null) invited(user.getId(), inviter, p, i);
        }
    }

    public void inviteAnswered(Long inviterId, User invitee, Project p, boolean accepted) {
        save(new Notification(inviterId, accepted ? Type.INVITE_ACCEPTED : Type.INVITE_DECLINED,
                invitee.getId(), p.getId(), null, null,
                invitee.getName() + (accepted ? " joined “" : " declined to join “") + p.getName() + "”"));
    }

    public void assigned(Long assigneeId, User actor, Task t) {
        if (assigneeId.equals(actor.getId())) return;
        save(new Notification(assigneeId, Type.ASSIGNED, actor.getId(), t.getProjectId(), t.getId(),
                null, actor.getName() + " assigned you “" + t.getTitle() + "”"));
    }

    /** Mentioned people get a MENTION; the task's creator and assignee get a COMMENT. Never the author. */
    public void commented(User author, Task t, String body, Collection<Long> mentioned) {
        String snippet = body.length() > 80 ? body.substring(0, 77) + "…" : body;
        for (Long id : mentioned) {
            if (!id.equals(author.getId())) {
                save(new Notification(id, Type.MENTION, author.getId(), t.getProjectId(), t.getId(),
                        null, author.getName() + " mentioned you on “" + t.getTitle() + "”: " + snippet));
            }
        }
        for (Long id : new LinkedHashSet<>(Arrays.asList(t.getCreatedBy(), t.getAssigneeId()))) {
            if (id != null && !id.equals(author.getId()) && !mentioned.contains(id)) {
                save(new Notification(id, Type.COMMENT, author.getId(), t.getProjectId(), t.getId(),
                        null, author.getName() + " commented on “" + t.getTitle() + "”: " + snippet));
            }
        }
    }

    /**
     * Tells the other members of a shared project what someone did. Several changes by the same
     * person to the same task in a short time update one unread notification instead of piling up.
     */
    public void activity(Collection<Long> recipients, User actor, Long projectId, Long taskId, String message) {
        Instant since = Instant.now().minus(MERGE_WINDOW);
        for (Long id : Set.copyOf(recipients)) {
            if (id.equals(actor.getId())) continue;
            Notification existing = taskId == null ? null : notifications
                    .findFirstByUserIdAndActorIdAndTaskIdAndTypeAndReadAtIsNullAndCreatedAtAfterOrderByIdDesc(
                            id, actor.getId(), taskId, Type.ACTIVITY, since)
                    .orElse(null);
            if (existing != null) {
                existing.merge(message);
                push(existing);
            } else {
                save(new Notification(id, Type.ACTIVITY, actor.getId(), projectId, taskId, null, message));
            }
        }
    }

    /** Reminders and deadline warnings, sent by the scheduler. */
    public void reminder(Long userId, Type type, Task t, String message) {
        save(new Notification(userId, type, null, t.getProjectId(), t.getId(), null, message));
    }

    private void save(Notification n) {
        push(notifications.save(n));
    }

    private void push(Notification n) {
        realtime.notify(List.of(n.getUserId()), "notification",
                new LiveNotification(n.getId(), n.getType(), n.getMessage(), n.getProjectId(), n.getTaskId()));
    }
}
