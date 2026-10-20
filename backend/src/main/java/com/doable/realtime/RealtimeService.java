package com.doable.realtime;

import java.io.IOException;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Pushes events to open browser tabs over Server-Sent Events (GET /api/events).
 * Two kinds: "notification" (something for this person; the bell refreshes) and
 * "changed" (a project's tasks changed; open lists reload).
 * Connections live in this process's memory, which suits a single app instance.
 */
@Service
public class RealtimeService {

    private static final Logger log = LoggerFactory.getLogger(RealtimeService.class);
    /** Browsers reconnect on their own; a long timeout keeps idle streams open. */
    private static final long TIMEOUT_MS = 30 * 60 * 1000L;

    private final Map<Long, List<SseEmitter>> byUser = new ConcurrentHashMap<>();

    public SseEmitter connect(Long userId) {
        SseEmitter emitter = new SseEmitter(TIMEOUT_MS);
        byUser.computeIfAbsent(userId, k -> new CopyOnWriteArrayList<>()).add(emitter);
        Runnable remove = () -> {
            List<SseEmitter> list = byUser.get(userId);
            if (list != null) list.remove(emitter);
        };
        emitter.onCompletion(remove);
        emitter.onTimeout(remove);
        emitter.onError(e -> remove.run());
        send(emitter, "ready", Map.of());
        return emitter;
    }

    /** Sends after the current transaction commits, so clients that reload see the new data. */
    public void notify(Collection<Long> userIds, String event, Object data) {
        Set<Long> targets = Set.copyOf(userIds);
        if (targets.isEmpty()) return;
        Runnable push = () -> targets.forEach(id -> {
            for (SseEmitter e : byUser.getOrDefault(id, List.of())) send(e, event, data);
        });
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    push.run();
                }
            });
        } else {
            push.run();
        }
    }

    /** A comment line every 25 s keeps proxies from closing quiet streams. */
    @Scheduled(fixedRate = 25_000)
    public void heartbeat() {
        byUser.values().forEach(list -> list.forEach(e -> {
            try {
                e.send(SseEmitter.event().comment("ping"));
            } catch (IOException | IllegalStateException ex) {
                list.remove(e);
            }
        }));
    }

    public int connections() {
        return byUser.values().stream().mapToInt(List::size).sum();
    }

    private void send(SseEmitter e, String event, Object data) {
        try {
            e.send(SseEmitter.event().name(event).data(data));
        } catch (IOException | IllegalStateException ex) {
            log.debug("Dropping closed event stream: {}", ex.getMessage());
            byUser.values().forEach(list -> list.remove(e));
        }
    }
}
