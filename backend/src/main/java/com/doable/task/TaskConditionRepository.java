package com.doable.task;

import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TaskConditionRepository extends JpaRepository<TaskCondition, Long> {

    List<TaskCondition> findByTaskIdInOrderByPositionAscIdAsc(Collection<Long> taskIds);

    List<TaskCondition> findByTaskIdOrderByPositionAscIdAsc(Long taskId);

    int countByTaskId(Long taskId);
}
