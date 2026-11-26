package com.doable.label;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface LabelRepository extends JpaRepository<Label, Long> {

    List<Label> findByOwnerIdOrderByNameAsc(Long ownerId);

    Optional<Label> findByOwnerIdAndNameIgnoreCase(Long ownerId, String name);

    Optional<Label> findByIdAndOwnerId(Long id, Long ownerId);

    /** Live tasks carrying each of the owner's labels. */
    @Query(value = "select tl.label_id, count(*) from task_labels tl join tasks t on t.id = tl.task_id "
            + "join labels l on l.id = tl.label_id where l.owner_id = :ownerId and t.deleted_at is null group by tl.label_id",
            nativeQuery = true)
    List<Object[]> usageRaw(Long ownerId);

    default Map<Long, Long> usage(Long ownerId) {
        return usageRaw(ownerId).stream().collect(Collectors.toMap(r -> ((Number) r[0]).longValue(), r -> ((Number) r[1]).longValue()));
    }

    /** Gives every task that has label "from" the label "into" too (tasks that already have it stay as they are). */
    @Modifying
    @Query(value = "insert into task_labels (task_id, label_id) select task_id, :into from task_labels where label_id = :from "
            + "on conflict do nothing", nativeQuery = true)
    int copyTasks(Long from, Long into);
}
