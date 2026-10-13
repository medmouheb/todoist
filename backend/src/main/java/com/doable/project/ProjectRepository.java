package com.doable.project;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProjectRepository extends JpaRepository<Project, Long> {

    Optional<Project> findByOwnerIdAndInboxTrue(Long ownerId);

    int countByOwnerId(Long ownerId);
}
