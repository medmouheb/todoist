package com.doable.notification;

import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface NotificationRepository extends JpaRepository<Notification, Long> {

    List<Notification> findByUserIdOrderByCreatedAtDesc(Long userId, Limit limit);

    long countByUserIdAndReadAtIsNull(Long userId);

    Optional<Notification> findByIdAndUserId(Long id, Long userId);

    Optional<Notification> findFirstByUserIdAndActorIdAndTaskIdAndTypeAndReadAtIsNullAndCreatedAtAfterOrderByIdDesc(
            Long userId, Long actorId, Long taskId, Notification.Type type, java.time.Instant after);

    @Modifying
    @Query("update Notification n set n.readAt = current_timestamp where n.userId = :userId and n.readAt is null")
    int markAllRead(Long userId);
}
