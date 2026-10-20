package com.doable.activity;

import com.doable.notification.NotificationService;
import com.doable.project.Project;
import com.doable.project.ProjectMember;
import com.doable.project.ProjectMemberRepository;
import com.doable.project.ProjectRepository;
import com.doable.realtime.RealtimeService;
import com.doable.user.User;
import com.doable.user.UserRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.stereotype.Service;

/**
 * Records every change in the history, tells the other members of a shared project about it,
 * and tells open browsers of everyone in the project to reload.
 */
@Service
public class ActivityService {

    /** Edits by the same person to the same task within this window become one history entry. */
    private static final Duration MERGE_WINDOW = Duration.ofSeconds(90);

    public enum Action {
        CREATED, UPDATED, COMPLETED, REOPENED, MOVED, REORDERED, DELETED, RESTORED, COMMENTED,
        PROJECT_CREATED, PROJECT_UPDATED, PROJECT_ARCHIVED, PROJECT_UNARCHIVED,
        MEMBER_JOINED, MEMBER_LEFT, MEMBER_REMOVED, ROLE_CHANGED, IMPORTED
    }

    private final ActivityRepository activities;
    private final ProjectMemberRepository members;
    private final ProjectRepository projects;
    private final UserRepository users;
    private final NotificationService notifications;
    private final RealtimeService realtime;

    public ActivityService(ActivityRepository activities, ProjectMemberRepository members, ProjectRepository projects,
                           UserRepository users, NotificationService notifications, RealtimeService realtime) {
        this.activities = activities;
        this.members = members;
        this.projects = projects;
        this.users = users;
        this.notifications = notifications;
        this.realtime = realtime;
    }

    /** Builds a changes map, keeping only fields whose value differs. */
    public static Map<String, List<Object>> diff(Map<String, Object> before, Map<String, Object> after) {
        Map<String, List<Object>> out = new LinkedHashMap<>();
        after.forEach((k, v) -> {
            Object old = before.get(k);
            if (!Objects.equals(old, v)) out.put(k, java.util.Arrays.asList(old, v));
        });
        return out;
    }

    public void record(Long actorId, Long projectId, Long taskId, String taskTitle, Action action,
                       Map<String, List<Object>> changes) {
        record(actorId, projectId, taskId, taskTitle, action, changes, java.util.Set.of());
    }

    /** @param alreadyNotified people who got a more specific notification for this (a mention, say) */
    public void record(Long actorId, Long projectId, Long taskId, String taskTitle, Action action,
                       Map<String, List<Object>> changes, java.util.Collection<Long> alreadyNotified) {
        if (action == Action.UPDATED && (changes == null || changes.isEmpty())) return;

        // Merge quick successive edits (or reorders) of the same task by the same person.
        Activity last = taskId == null ? null : activities.findFirstByTaskIdOrderByIdDesc(taskId).orElse(null);
        boolean merge = last != null && Objects.equals(last.getActorId(), actorId)
                && last.getAction().equals(action.name())
                && (action == Action.UPDATED || action == Action.REORDERED)
                && last.getCreatedAt().isAfter(Instant.now().minus(MERGE_WINDOW));
        Map<String, List<Object>> summary = changes;
        if (merge) {
            last.merge(changes == null ? Map.of() : changes, taskTitle);
            summary = last.getChanges(); // describe everything merged so far, not just this edit
            if (summary == null && action == Action.UPDATED) activities.delete(last); // edits cancelled out
        } else {
            activities.save(new Activity(projectId, taskId, taskTitle, actorId, action.name(), changes));
        }

        List<Long> everyone = members.forProject(projectId).stream().map(ProjectMember::getUserId).toList();
        realtime.notify(everyone, "changed", Map.of("projectId", projectId));
        boolean nothingLeft = action == Action.UPDATED && summary == null; // edited back to how it was
        if (everyone.size() > 1 && actorId != null && action != Action.REORDERED && !nothingLeft) {
            User actor = users.findById(actorId).orElse(null);
            Project p = projects.findById(projectId).orElse(null);
            if (actor != null && p != null) {
                List<Long> recipients = everyone.stream().filter(id -> !alreadyNotified.contains(id)).toList();
                notifications.activity(recipients, actor, projectId, taskId, describe(actor, p, taskTitle, action, summary));
            }
        }
    }

    /** "Maya changed the date and priority of “Write post” in Launch". */
    static String describe(User actor, Project p, String title, Action action, Map<String, List<Object>> changes) {
        String who = actor.getName();
        String task = title == null ? "a task" : "“" + title + "”";
        String where = " in " + p.getName();
        return switch (action) {
            case CREATED -> who + " added " + task + where;
            case COMPLETED -> who + " completed " + task + where;
            case REOPENED -> who + " reopened " + task + where;
            case MOVED -> who + " moved " + task + " to " + p.getName();
            case DELETED -> who + " deleted " + task + where;
            case RESTORED -> who + " restored " + task + where;
            case COMMENTED -> who + " commented on " + task + where;
            case REORDERED -> who + " reordered tasks" + where;
            case IMPORTED -> who + " imported tasks into " + p.getName();
            case UPDATED -> who + " changed the " + fields(changes) + " of " + task + where;
            case PROJECT_CREATED -> who + " created " + p.getName();
            case PROJECT_UPDATED -> who + " changed the " + fields(changes) + " of " + p.getName();
            case PROJECT_ARCHIVED -> who + " archived " + p.getName();
            case PROJECT_UNARCHIVED -> who + " unarchived " + p.getName();
            case MEMBER_JOINED -> who + " joined " + p.getName();
            case MEMBER_LEFT -> who + " left " + p.getName();
            case MEMBER_REMOVED -> who + " removed " + (title == null ? "someone" : title) + " from " + p.getName();
            case ROLE_CHANGED -> who + " changed " + (title == null ? "someone" : title) + "’s role in " + p.getName();
        };
    }

    private static String fields(Map<String, List<Object>> changes) {
        if (changes == null || changes.isEmpty()) return "details";
        List<String> names = changes.keySet().stream().toList();
        if (names.size() == 1) return names.getFirst();
        return String.join(", ", names.subList(0, names.size() - 1)) + " and " + names.getLast();
    }
}
