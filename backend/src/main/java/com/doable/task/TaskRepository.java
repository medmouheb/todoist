package com.doable.task;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface TaskRepository extends JpaRepository<Task, Long> {

    Optional<Task> findByIdAndOwnerId(Long id, Long ownerId);

    List<Task> findByOwnerIdAndProjectIdAndCompletedFalse(Long ownerId, Long projectId);

    List<Task> findByOwnerIdAndProjectIdAndCompletedTrueOrderByCompletedAtDesc(Long ownerId, Long projectId);

    List<Task> findByOwnerIdAndCompletedFalseAndDueDateLessThanEqual(Long ownerId, LocalDate date);

    List<Task> findByOwnerIdAndCompletedFalseAndDueDateGreaterThanEqual(Long ownerId, LocalDate date);

    long countByProjectIdAndCompletedFalse(Long projectId);

    int countByProjectId(Long projectId);

    @Query("select t.projectId, count(t) from Task t where t.ownerId = :ownerId and t.completed = false group by t.projectId")
    List<Object[]> countOpenByProjectRaw(Long ownerId);

    default Map<Long, Long> countOpenByProject(Long ownerId) {
        return countOpenByProjectRaw(ownerId).stream()
                .collect(Collectors.toMap(r -> (Long) r[0], r -> (Long) r[1]));
    }
}
