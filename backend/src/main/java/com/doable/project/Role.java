package com.doable.project;

/**
 * What a project member may do. Ordered from least to most.
 * GUEST: view, comment, complete tasks assigned to them.
 * MEMBER: add, edit, complete, move and delete tasks.
 * ADMIN: also rename, archive or delete the project and manage who's in it.
 */
public enum Role {
    GUEST, MEMBER, ADMIN;

    public boolean atLeast(Role other) {
        return compareTo(other) >= 0;
    }
}
