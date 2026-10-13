package com.doable.label;

import com.doable.common.CurrentUser;
import com.doable.common.NotFoundException;
import com.doable.project.ProjectDtos;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/labels")
public class LabelController {

    public record LabelRequest(@NotBlank @Size(max = 60) @Pattern(regexp = "[^\\s@#]+", message = "no spaces, @ or #")
                               String name,
                               @Pattern(regexp = ProjectDtos.COLORS) String color) {
    }

    public record LabelResponse(Long id, String name, String color) {
        public static LabelResponse of(Label l) {
            return new LabelResponse(l.getId(), l.getName(), l.getColor());
        }
    }

    private final LabelService labels;
    private final LabelRepository repo;

    public LabelController(LabelService labels, LabelRepository repo) {
        this.labels = labels;
        this.repo = repo;
    }

    @GetMapping
    public List<LabelResponse> list(@AuthenticationPrincipal Jwt jwt) {
        return repo.findByOwnerIdOrderByNameAsc(CurrentUser.id(jwt)).stream().map(LabelResponse::of).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public LabelResponse create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody LabelRequest req) {
        Label l = labels.findOrCreate(CurrentUser.id(jwt), req.name());
        if (req.color() != null) {
            l.setColor(req.color());
            repo.save(l);
        }
        return LabelResponse.of(l);
    }

    @PutMapping("/{id}")
    @Transactional
    public LabelResponse update(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id,
                                @Valid @RequestBody LabelRequest req) {
        Label l = repo.findByIdAndOwnerId(id, CurrentUser.id(jwt)).orElseThrow(() -> new NotFoundException("Label"));
        l.setName(req.name().trim());
        if (req.color() != null) l.setColor(req.color());
        return LabelResponse.of(l);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id) {
        repo.delete(repo.findByIdAndOwnerId(id, CurrentUser.id(jwt)).orElseThrow(() -> new NotFoundException("Label")));
    }
}
