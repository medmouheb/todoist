package com.doable.project;

/**
 * What a project member may do. Ordered from least to most.
 * GUEST: view, comment, complete tasks assigned to them.
 * MEMBER: add, edit, complete, move and delete tasks.
 * ADMIN: also rename, archive or delete the project and manage who's in it.
 */
public enum Role {
    GUEST, MEMBER, ADMIN;

    /** What the role allows, in plain words (shown in invitations). */
    public String permissions() {
        return switch (this) {
            case ADMIN -> "view, add, edit, complete and delete tasks, comment, and manage the project and its people";
            case MEMBER -> "view, add, edit, complete and delete tasks, and comment";
            case GUEST -> "view tasks, comment, and complete tasks assigned to you";
        };
    }

    public String label() {
        return name().charAt(0) + name().substring(1).toLowerCase();
    }

    public boolean atLeast(Role other) {
        return compareTo(other) >= 0;
    }
}
