package com.doable.activity;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;

/** Pages are read newest first with "id < before" (keyset), which stays fast however long the history gets. */
public interface ActivityRepository extends JpaRepository<Activity, Long> {

    List<Activity> findByProjectIdInAndIdLessThanOrderByIdDesc(Collection<Long> projectIds, Long before, Limit limit);

    List<Activity> findByTaskIdAndIdLessThanOrderByIdDesc(Long taskId, Long before, Limit limit);

    Optional<Activity> findFirstByTaskIdOrderByIdDesc(Long taskId);
}
