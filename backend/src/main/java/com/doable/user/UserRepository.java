package com.doable.user;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, Long> {

    Optional<User> findByEmailIgnoreCase(String email);

    boolean existsByEmailIgnoreCase(String email);

    default Map<Long, User> byIds(Collection<Long> ids) {
        List<User> found = ids.isEmpty() ? List.of() : findAllById(ids);
        return found.stream().collect(Collectors.toMap(User::getId, Function.identity()));
    }
}
