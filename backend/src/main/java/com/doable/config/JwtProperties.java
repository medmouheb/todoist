package com.doable.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "doable.jwt")
public record JwtProperties(String secret, long ttlHours) {

    public JwtProperties {
        if (secret == null || secret.length() < 32) {
            throw new IllegalStateException("JWT_SECRET must be at least 32 characters");
        }
    }
}
