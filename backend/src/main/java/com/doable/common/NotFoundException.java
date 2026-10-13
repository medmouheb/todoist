package com.doable.common;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public class NotFoundException extends ResponseStatusException {

    public NotFoundException(String what) {
        super(HttpStatus.NOT_FOUND, what + " not found");
    }
}
