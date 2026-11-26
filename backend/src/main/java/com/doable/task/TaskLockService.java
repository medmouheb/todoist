package com.doable.task;

import com.doable.common.NotFoundException;
import com.doable.notification.NotificationService;
import com.doable.project.ProjectAccess;
import com.doable.project.ProjectMember;
import com.doable.project.ProjectMemberRepository;
import com.doable.project.Role;
import com.doable.realtime.RealtimeService;
import com.doable.user.User;
import com.doable.user.UserRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/**
 * While someone edits a task (its panel is open), it's locked for everyone else: they see who is
 * editing, can't change it, and can ask for it to be unlocked. A lock lasts {@link #TTL} and the
 * editor's browser renews it, so a closed tab frees the task by itself.
 * Locks live in this process's memory, which suits a single app instance.
 */
@Service
public class TaskLockService {

    static final Duration TTL = Duration.ofSeconds(90);

    private record Lock(Long userId, String userName, Long projectId, Instant expiresAt) {
        boolean live() {
            return expiresAt.isAfter(Instant.now());
        }
    }

    /** holderId null means nobody is editing it. */
    public record LockState(Long taskId, Long holderId, String holderName, boolean mine, Instant expiresAt) {
    }

    private final Map<Long, Lock> locks = new ConcurrentHashMap<>();
    private final TaskRepository tasks;
    private final ProjectAccess access;
    private final ProjectMemberRepository members;
    private final UserRepository users;
    private final RealtimeService realtime;
    private final NotificationService notifications;

    public TaskLockService(TaskRepository tasks, ProjectAccess access, ProjectMemberRepository members, UserRepository users,
                           RealtimeService realtime, NotificationService notifications) {
        this.tasks = tasks;
        this.access = access;
        this.members = members;
        this.users = users;
        this.realtime = realtime;
        this.notifications = notifications;
    }

    /** Takes (or renews) the lock if nobody else holds it, and says who holds it now. */
    public LockState acquire(Long userId, Long taskId) {
        Task t = task(userId, taskId);
        access.require(userId, t.getProjectId(), Role.MEMBER);
        User me = users.findById(userId).orElseThrow();
        boolean[] changed = {false};
        Lock now = locks.compute(taskId, (id, cur) -> {
            if (cur != null && cur.live() && !cur.userId().equals(userId)) return cur;
            changed[0] = cur == null || !cur.live() || !cur.userId().equals(userId);
            return new Lock(userId, me.getName(), t.getProjectId(), Instant.now().plus(TTL));
        });
        if (changed[0]) broadcast(taskId, now);
        return state(taskId, now, userId);
    }

    /** Frees the task if you hold it. */
    public LockState release(Long userId, Long taskId) {
        Lock cur = locks.get(taskId);
        if (cur != null && cur.userId().equals(userId) && locks.remove(taskId, cur)) broadcast(taskId, null);
        Lock after = live(taskId);
        return state(taskId, after, userId);
    }

    /** Asks whoever is editing to unlock it, with an optional message. */
    public LockState requestUnlock(Long userId, Long taskId, String message) {
        Task t = task(userId, taskId);
        Lock cur = live(taskId);
        if (cur == null || cur.userId().equals(userId)) return state(taskId, cur, userId);
        User me = users.findById(userId).orElseThrow();
        notifications.unlockRequest(cur.userId(), me, t, message == null || message.isBlank() ? null : message.trim());
        return state(taskId, cur, userId);
    }

    /** Refuses a change while someone else is editing the task. */
    public void check(Long userId, Long taskId) {
        Lock cur = live(taskId);
        if (cur != null && !cur.userId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.LOCKED,
                    cur.userName() + " is editing this task right now. Ask them to unlock it, or try again in a moment.");
        }
    }

    public LockState state(Long userId, Long taskId) {
        task(userId, taskId);
        return state(taskId, live(taskId), userId);
    }

    /** Locks whose browser stopped renewing them (tab closed, connection lost). */
    @Scheduled(fixedDelay = 30_000)
    public void expire() {
        locks.forEach((id, lock) -> {
            if (!lock.live() && locks.remove(id, lock)) broadcast(id, null);
        });
    }

    private Lock live(Long taskId) {
        Lock cur = locks.get(taskId);
        return cur != null && cur.live() ? cur : null;
    }

    private Task task(Long userId, Long taskId) {
        Task t = tasks.findLive(taskId).orElseThrow(() -> new NotFoundException("Task"));
        if (!access.isMember(userId, t.getProjectId())) throw new NotFoundException("Task");
        return t;
    }

    private static LockState state(Long taskId, Lock l, Long userId) {
        return l == null ? new LockState(taskId, null, null, false, null)
                : new LockState(taskId, l.userId(), l.userName(), l.userId().equals(userId), l.expiresAt());
    }

    /** Everyone in the project learns who is editing (or that nobody is). */
    private void broadcast(Long taskId, Lock l) {
        Long projectId = l != null ? l.projectId() : tasks.findById(taskId).map(Task::getProjectId).orElse(null);
        if (projectId == null) return;
        Map<String, Object> data = new HashMap<>();
        data.put("taskId", taskId);
        data.put("holderId", l == null ? null : l.userId());
        data.put("holderName", l == null ? null : l.userName());
        realtime.notify(members.forProject(projectId).stream().map(ProjectMember::getUserId).toList(), "lock", data);
    }
}
