package com.doable.category;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CategoryHistoryRepository extends JpaRepository<CategoryHistory, Long> {

    List<CategoryHistory> findByCategoryIdOrderByIdDesc(Long categoryId);
}
