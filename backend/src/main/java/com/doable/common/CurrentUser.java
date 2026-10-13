package com.doable.common;

import org.springframework.security.oauth2.jwt.Jwt;

public final class CurrentUser {

    private CurrentUser() {
    }

    /** The JWT subject is the user's id. */
    public static long id(Jwt jwt) {
        return Long.parseLong(jwt.getSubject());
    }
}
