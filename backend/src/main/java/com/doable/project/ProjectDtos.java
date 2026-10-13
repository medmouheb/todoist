package com.doable.project;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public final class ProjectDtos {

    /** Matches the project color tokens in the Doable design system (proj-moss, proj-clay, ...). */
    static final String COLORS = "moss|clay|sky|plum|sun|rose|slate|teal|lime|charcoal";

    private ProjectDtos() {
    }

    public record ProjectRequest(
            @NotBlank @Size(max = 120) String name,
            @Pattern(regexp = COLORS) String color,
            Boolean favorite) {
    }

    public record ProjectResponse(Long id, String name, String color, boolean favorite, boolean inbox,
                                  int position, long openTasks) {
        static ProjectResponse of(Project p, long openTasks) {
            return new ProjectResponse(p.getId(), p.getName(), p.getColor(), p.isFavorite(), p.isInbox(),
                    p.getPosition(), openTasks);
        }
    }
}
