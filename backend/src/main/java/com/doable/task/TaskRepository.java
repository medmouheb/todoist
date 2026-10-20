package com.doable.task;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface TaskRepository extends JpaRepository<Task, Long> {

    @Query("select t from Task t where t.id = :id and t.deletedAt is null")
    Optional<Task> findLive(Long id);

    /** Open top-level tasks of one project. */
    @Query("select t from Task t where t.projectId = :projectId and t.parentId is null and t.completed = false "
            + "and t.deletedAt is null")
    List<Task> openTopLevel(Long projectId);

    /** Open tasks due on or before a date, in the given projects, that are unassigned or assigned to the user. */
    @Query("select t from Task t where t.projectId in :projectIds and t.completed = false and t.deletedAt is null "
            + "and t.dueDate <= :date and (t.assigneeId is null or t.assigneeId = :userId)")
    List<Task> dueOnOrBefore(Collection<Long> projectIds, LocalDate date, Long userId);

    @Query("select t from Task t where t.projectId in :projectIds and t.completed = false and t.deletedAt is null "
            + "and t.dueDate >= :date and (t.assigneeId is null or t.assigneeId = :userId)")
    List<Task> dueOnOrAfter(Collection<Long> projectIds, LocalDate date, Long userId);

    @Query("select t from Task t where t.projectId in :projectIds and t.completed = true and t.deletedAt is null "
            + "order by t.completedAt desc")
    List<Task> completedIn(Collection<Long> projectIds, Limit limit);

    List<Task> findByProjectIdInAndDeletedAtIsNullOrderById(Collection<Long> projectIds);

    /** Every open task (sub-tasks too) in the given projects, for the tree. */
    @Query("select t from Task t where t.projectId in :projectIds and t.completed = false and t.deletedAt is null")
    List<Task> openIn(Collection<Long> projectIds);

    @Query("select t from Task t where t.projectId in :projectIds and t.categoryId = :categoryId "
            + "and t.completed = false and t.deletedAt is null")
    List<Task> openInCategory(Collection<Long> projectIds, Long categoryId);

    /** Timed tasks on or around the given days that haven't had their reminder yet. */
    @Query("select t from Task t where t.completed = false and t.deletedAt is null and t.dueTime is not null "
            + "and t.reminderSentAt is null and t.dueDate between :from and :to")
    List<Task> needingReminder(LocalDate from, LocalDate to);

    /** Deadlines within the next day not yet warned about, or already passed and not yet reported. */
    @Query("select t from Task t where t.completed = false and t.deletedAt is null and t.deadline is not null "
            + "and ((t.deadlineWarnedAt is null and t.deadline <= :soon) or (t.deadlineMissedAt is null and t.deadline <= :now))")
    List<Task> needingDeadlineNotice(Instant now, Instant soon);

    @Query("select t from Task t where t.parentId = :parentId and t.deletedAt is null")
    List<Task> children(Long parentId);

    @Query("select t from Task t where t.parentId = :parentId and t.deletedAt = :deletedAt")
    List<Task> deletedChildren(Long parentId, Instant deletedAt);

    @Query("select count(t) from Task t where t.projectId = :projectId")
    int countInProject(Long projectId);

    @Query("select t.projectId, count(t) from Task t where t.projectId in :projectIds and t.completed = false "
            + "and t.deletedAt is null group by t.projectId")
    List<Object[]> countOpenByProjectRaw(Collection<Long> projectIds);

    default Map<Long, Long> countOpenByProject(Collection<Long> projectIds) {
        if (projectIds.isEmpty()) return Map.of();
        return countOpenByProjectRaw(projectIds).stream()
                .collect(Collectors.toMap(r -> (Long) r[0], r -> (Long) r[1]));
    }

    /** [parentId, total, done] for each parent. */
    @Query("select t.parentId, count(t), sum(case when t.completed = true then 1 else 0 end) from Task t "
            + "where t.parentId in :parentIds and t.deletedAt is null group by t.parentId")
    List<Object[]> subtaskCounts(Collection<Long> parentIds);

    @Modifying
    @Query("update Task t set t.assigneeId = null where t.projectId = :projectId and t.assigneeId = :userId")
    int unassignInProject(Long projectId, Long userId);

    @Modifying
    @Query("delete from Task t where t.deletedAt < :before")
    int purgeDeletedBefore(Instant before);
}
