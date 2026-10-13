package com.doable.project;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ProjectMemberRepository extends JpaRepository<ProjectMember, ProjectMember.Key> {

    @Query("select m from ProjectMember m where m.id.projectId = :projectId and m.id.userId = :userId")
    Optional<ProjectMember> find(Long projectId, Long userId);

    @Query("select m from ProjectMember m where m.id.userId = :userId")
    List<ProjectMember> forUser(Long userId);

    @Query("select m from ProjectMember m where m.id.projectId = :projectId order by m.joinedAt")
    List<ProjectMember> forProject(Long projectId);

    @Query("select count(m) from ProjectMember m where m.id.projectId = :projectId and m.role = :role")
    long countWithRole(Long projectId, Role role);

    @Query("select m.id.projectId, count(m) from ProjectMember m where m.id.projectId in "
            + "(select x.id.projectId from ProjectMember x where x.id.userId = :userId) group by m.id.projectId")
    List<Object[]> memberCountsRaw(Long userId);

    default Map<Long, Long> memberCounts(Long userId) {
        return memberCountsRaw(userId).stream().collect(Collectors.toMap(r -> (Long) r[0], r -> (Long) r[1]));
    }
}
