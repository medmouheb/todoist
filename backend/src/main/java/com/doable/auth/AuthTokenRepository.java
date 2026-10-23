package com.doable.auth;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AuthTokenRepository extends JpaRepository<AuthToken, Long> {

    Optional<AuthToken> findByTokenHash(String tokenHash);

    Optional<AuthToken> findFirstByUserIdAndPurposeOrderByCreatedAtDesc(Long userId, AuthToken.Purpose purpose);

    /** Retires older unused tokens when a new one is sent, so only the newest code or link works. */
    @org.springframework.data.jpa.repository.Modifying
    @org.springframework.data.jpa.repository.Query("update AuthToken t set t.usedAt = current_timestamp where t.userId = :userId "
            + "and t.purpose in :purposes and t.usedAt is null")
    int retire(Long userId, java.util.Collection<AuthToken.Purpose> purposes);
}
