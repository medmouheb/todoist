package com.doable.auth;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/** A one-time token sent by email. Only its SHA-256 hash is stored. */
@Entity
@Table(name = "auth_tokens")
public class AuthToken {

    public enum Purpose { PASSWORD_RESET, LOGIN_LINK }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "token_hash", nullable = false, unique = true)
    private String tokenHash;

    @Column(nullable = false)
    @jakarta.persistence.Enumerated(jakarta.persistence.EnumType.STRING)
    private Purpose purpose;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "used_at")
    private Instant usedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    protected AuthToken() {
    }

    public AuthToken(Long userId, String tokenHash, Purpose purpose, Instant expiresAt) {
        this.userId = userId;
        this.tokenHash = tokenHash;
        this.purpose = purpose;
        this.expiresAt = expiresAt;
    }

    public boolean usable(Purpose expected) {
        return purpose == expected && usedAt == null && Instant.now().isBefore(expiresAt);
    }

    public void markUsed() { this.usedAt = Instant.now(); }
    public Long getUserId() { return userId; }
}
