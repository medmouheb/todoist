package com.doable.task;

import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TaskNotDoneRepository extends JpaRepository<TaskNotDone, Long> {

    List<TaskNotDone> findByTaskIdInOrderByIdAsc(Collection<Long> taskIds);
}
