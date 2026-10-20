package com.doable.task;

import com.doable.notification.Notification.Type;
import com.doable.notification.NotificationService;
import com.doable.project.Project;
import com.doable.project.ProjectRepository;
import com.doable.user.User;
import com.doable.user.UserRepository;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Checks every minute for:
 * - timed tasks starting within 15 minutes ("Starts at 15:00"),
 * - deadlines less than a day away,
 * - deadlines that passed while the task is still open.
 * Each goes once to the task's assignee, or to whoever created it when nobody is assigned,
 * and is pushed live to their open tabs.
 */
@Service
public class ReminderService {

    private static final Logger log = LoggerFactory.getLogger(ReminderService.class);
    static final Duration REMIND_BEFORE = Duration.ofMinutes(15);
    static final Duration WARN_BEFORE_DEADLINE = Duration.ofHours(24);

    private final TaskRepository tasks;
    private final UserRepository users;
    private final ProjectRepository projects;
    private final NotificationService notifications;

    public ReminderService(TaskRepository tasks, UserRepository users, ProjectRepository projects,
                           NotificationService notifications) {
        this.tasks = tasks;
        this.users = users;
        this.projects = projects;
        this.notifications = notifications;
    }

    @Scheduled(fixedDelay = 60_000, initialDelay = 30_000)
    @Transactional
    public void run() {
        Instant now = Instant.now();
        try {
            remindTimedTasks(now);
            checkDeadlines(now);
        } catch (RuntimeException e) {
            log.warn("Reminder check failed: {}", e.getMessage());
        }
    }

    void remindTimedTasks(Instant now) {
        // Due dates are local to the person; a day either side of UTC today covers every time zone.
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        var due = tasks.needingReminder(today.minusDays(1), today.plusDays(1));
        if (due.isEmpty()) return;
        Map<Long, User> people = people(due.stream().map(this::recipient).collect(Collectors.toSet()));
        for (Task t : due) {
            User u = people.get(recipient(t));
            if (u == null) continue;
            ZoneId zone = zone(u);
            Instant starts = ZonedDateTime.of(t.getDueDate(), t.getDueTime(), zone).toInstant();
            if (now.isBefore(starts.minus(REMIND_BEFORE))) continue;       // not yet
            t.setReminderSentAt(now);
            if (now.isAfter(starts.plus(Duration.ofHours(1)))) continue;   // long past: don't nag
            String at = t.getDueTime().format(DateTimeFormatter.ofPattern("HH:mm"));
            notifications.reminder(u.getId(), Type.REMINDER, t,
                    "“" + t.getTitle() + "” starts at " + at + where(t));
        }
    }

    void checkDeadlines(Instant now) {
        var found = tasks.needingDeadlineNotice(now, now.plus(WARN_BEFORE_DEADLINE));
        if (found.isEmpty()) return;
        Map<Long, User> people = people(found.stream().map(this::recipient).collect(Collectors.toSet()));
        for (Task t : found) {
            User u = people.get(recipient(t));
            if (u == null) continue;
            String when = t.getDeadline().atZone(zone(u)).format(DateTimeFormatter.ofPattern("EEE d MMM, HH:mm"));
            if (!t.getDeadline().isAfter(now)) {
                t.setDeadlineMissedAt(now);
                if (t.getDeadlineWarnedAt() == null) t.setDeadlineWarnedAt(now);
                notifications.reminder(u.getId(), Type.DEADLINE_MISSED, t,
                        "Deadline passed: “" + t.getTitle() + "” was due " + when + " and isn’t done" + where(t));
            } else if (t.getDeadlineWarnedAt() == null) {
                t.setDeadlineWarnedAt(now);
                notifications.reminder(u.getId(), Type.DEADLINE_SOON, t,
                        "Deadline soon: “" + t.getTitle() + "” is due " + when + where(t));
            }
        }
    }

    private Long recipient(Task t) {
        return t.getAssigneeId() != null ? t.getAssigneeId() : t.getCreatedBy();
    }

    private Map<Long, User> people(Set<Long> ids) {
        return users.findAllById(new LinkedHashSet<>(ids)).stream()
                .collect(Collectors.toMap(User::getId, Function.identity()));
    }

    private String where(Task t) {
        return projects.findById(t.getProjectId()).filter(p -> !p.isInbox()).map(Project::getName)
                .map(n -> " (" + n + ")").orElse("");
    }

    private static ZoneId zone(User u) {
        try {
            return ZoneId.of(Objects.requireNonNullElse(u.getTimeZone(), "UTC"));
        } catch (RuntimeException e) {
            return ZoneOffset.UTC;
        }
    }
}
