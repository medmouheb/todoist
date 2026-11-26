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

    /** Renames or recolors. A name that is another of your hashtags written differently is refused: merge instead. */
    @PutMapping("/{id}")
    @Transactional
    public LabelResponse update(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id,
                                @Valid @RequestBody LabelRequest req) {
        long owner = CurrentUser.id(jwt);
        Label l = repo.findByIdAndOwnerId(id, owner).orElseThrow(() -> new NotFoundException("Label"));
        String name = req.name().trim();
        String norm = LabelMeaning.normalize(name);
        repo.findByOwnerIdOrderByNameAsc(owner).stream()
                .filter(o -> !o.getId().equals(id) && LabelMeaning.normalize(o.getName()).equals(norm)).findFirst()
                .ifPresent(o -> {
                    throw new org.springframework.web.server.ResponseStatusException(HttpStatus.CONFLICT,
                            "#" + o.getName() + " already means the same. Merge the two instead.");
                });
        l.setName(name);
        if (req.color() != null) l.setColor(req.color());
        return LabelResponse.of(l);
    }

    // ---- hashtag manager ----

    public record LabelUsage(Long id, String name, String color, long taskCount) {
    }

    /** Pairs of your hashtags that probably mean the same thing. */
    public record Duplicate(LabelUsage a, LabelUsage b, String reason) {
    }

    public record MergeRequest(@jakarta.validation.constraints.NotNull Long intoId) {
    }

    /** Your hashtags with how many tasks use each. */
    @GetMapping("/usage")
    public List<LabelUsage> usage(@AuthenticationPrincipal Jwt jwt) {
        long owner = CurrentUser.id(jwt);
        java.util.Map<Long, Long> counts = repo.usage(owner);
        return repo.findByOwnerIdOrderByNameAsc(owner).stream()
                .map(l -> new LabelUsage(l.getId(), l.getName(), l.getColor(), counts.getOrDefault(l.getId(), 0L))).toList();
    }

    /** Likely duplicates: same word written differently, synonyms, or near-identical spelling. */
    @GetMapping("/duplicates")
    public List<Duplicate> duplicates(@AuthenticationPrincipal Jwt jwt) {
        List<LabelUsage> all = usage(jwt);
        List<Duplicate> out = new java.util.ArrayList<>();
        for (int i = 0; i < all.size(); i++) {
            for (int j = i + 1; j < all.size(); j++) {
                String why = LabelMeaning.sameMeaning(all.get(i).name(), all.get(j).name());
                if (why == null) continue;
                // Suggest keeping the one more tasks use.
                LabelUsage keep = all.get(i).taskCount() >= all.get(j).taskCount() ? all.get(i) : all.get(j);
                LabelUsage drop = keep == all.get(i) ? all.get(j) : all.get(i);
                out.add(new Duplicate(drop, keep, why));
            }
        }
        return out;
    }

    /** Moves every task from this hashtag to another one, then deletes this one. */
    @PostMapping("/{id}/merge")
    @Transactional
    public LabelResponse merge(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id, @Valid @RequestBody MergeRequest req) {
        long owner = CurrentUser.id(jwt);
        Label from = repo.findByIdAndOwnerId(id, owner).orElseThrow(() -> new NotFoundException("Label"));
        Label into = repo.findByIdAndOwnerId(req.intoId(), owner).orElseThrow(() -> new NotFoundException("Label"));
        if (from.getId().equals(into.getId())) return LabelResponse.of(into);
        repo.copyTasks(from.getId(), into.getId());
        repo.delete(from);
        return LabelResponse.of(into);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id) {
        repo.delete(repo.findByIdAndOwnerId(id, CurrentUser.id(jwt)).orElseThrow(() -> new NotFoundException("Label")));
    }
}
