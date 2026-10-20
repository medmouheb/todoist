package com.doable.project;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;

public final class ProjectDtos {

    /** Matches the project color tokens in the Doable design system (proj-moss, proj-clay, ...). */
    public static final String COLORS = "moss|clay|sky|plum|sun|rose|slate|teal|lime|charcoal";

    private ProjectDtos() {
    }

    /** name and color need an admin; favorite is personal and anyone can set it. */
    public record ProjectRequest(
            @Size(min = 1, max = 120) String name,
            @Pattern(regexp = COLORS) String color,
            Boolean favorite,
            Boolean archived) {
    }

    public record ProjectResponse(Long id, String name, String color, boolean favorite, boolean inbox,
                                  boolean archived, int position, long openTasks, Role role, long memberCount) {
    }

    public record InviteRequest(@NotBlank @Email @Size(max = 255) String email, @NotNull Role role) {
    }

    public record RoleRequest(@NotNull Role role) {
    }

    public record MemberResponse(Long userId, String name, String email, String initials, Role role) {
    }

    public record InviteResponse(Long id, Long projectId, String projectName, String projectColor, String email, Role role,
                                 String permissions,
                                 String invitedBy, Instant createdAt) {
    }

    public record SharingResponse(Role myRole, java.util.List<MemberResponse> members,
                                  java.util.List<InviteResponse> invites) {
    }
}
