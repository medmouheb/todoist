package com.doable.label;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LabelRepository extends JpaRepository<Label, Long> {

    List<Label> findByOwnerIdOrderByNameAsc(Long ownerId);

    Optional<Label> findByOwnerIdAndNameIgnoreCase(Long ownerId, String name);

    Optional<Label> findByIdAndOwnerId(Long id, Long ownerId);
}
