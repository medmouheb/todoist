package com.doable.comment;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface CommentRepository extends JpaRepository<Comment, Long> {

    List<Comment> findByTaskIdOrderByCreatedAtAsc(Long taskId);

    @Query("select c.taskId, count(c) from Comment c where c.taskId in :taskIds group by c.taskId")
    List<Object[]> countByTaskRaw(Collection<Long> taskIds);

    default Map<Long, Long> countByTask(Collection<Long> taskIds) {
        if (taskIds.isEmpty()) return Map.of();
        return countByTaskRaw(taskIds).stream().collect(Collectors.toMap(r -> (Long) r[0], r -> (Long) r[1]));
    }
}
