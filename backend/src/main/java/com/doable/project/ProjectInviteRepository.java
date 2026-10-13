package com.doable.project;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProjectInviteRepository extends JpaRepository<ProjectInvite, Long> {

    List<ProjectInvite> findByProjectIdOrderByCreatedAt(Long projectId);

    List<ProjectInvite> findByEmailIgnoreCaseOrderByCreatedAtDesc(String email);

    Optional<ProjectInvite> findByProjectIdAndEmailIgnoreCase(Long projectId, String email);
}
