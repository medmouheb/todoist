package com.doable.category;

import com.doable.common.CurrentUser;
import com.doable.common.NotFoundException;
import com.doable.project.ProjectDtos;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
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
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/categories")
public class CategoryController {

    public record CategoryRequest(@NotBlank @Size(max = 60) String name, @Pattern(regexp = ProjectDtos.COLORS) String color) {
    }

    public record OrderRequest(@NotNull List<Long> ids) {
    }

    public record CategoryResponse(Long id, String name, String color, int position) {
        public static CategoryResponse of(Category c) {
            return new CategoryResponse(c.getId(), c.getName(), c.getColor(), c.getPosition());
        }
    }

    private final CategoryRepository categories;

    public CategoryController(CategoryRepository categories) {
        this.categories = categories;
    }

    @GetMapping
    public List<CategoryResponse> list(@AuthenticationPrincipal Jwt jwt) {
        return categories.findByOwnerIdOrderByPositionAscIdAsc(CurrentUser.id(jwt)).stream().map(CategoryResponse::of).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public CategoryResponse create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody CategoryRequest req) {
        long owner = CurrentUser.id(jwt);
        String name = req.name().trim();
        if (categories.existsByOwnerIdAndNameIgnoreCase(owner, name)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "You already have a category called “" + name + "”.");
        }
        return CategoryResponse.of(categories.save(new Category(owner, name, req.color() == null ? "slate" : req.color(),
                categories.countByOwnerId(owner))));
    }

    @PutMapping("/{id}")
    @Transactional
    public CategoryResponse update(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id, @Valid @RequestBody CategoryRequest req) {
        Category c = get(jwt, id);
        c.setName(req.name().trim());
        if (req.color() != null) c.setColor(req.color());
        return CategoryResponse.of(c);
    }

    /** Sets the order categories appear in. */
    @PutMapping("/order")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void reorder(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody OrderRequest req) {
        Map<Long, Category> mine = categories.findByOwnerIdOrderByPositionAscIdAsc(CurrentUser.id(jwt)).stream()
                .collect(Collectors.toMap(Category::getId, Function.identity()));
        int pos = 0;
        for (Long id : req.ids()) {
            Category c = mine.remove(id);
            if (c != null) c.setPosition(pos++);
        }
        for (Category c : mine.values()) c.setPosition(pos++);
    }

    /** Tasks in the category keep existing; they just lose the category. */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id) {
        categories.delete(get(jwt, id));
    }

    private Category get(Jwt jwt, Long id) {
        return categories.findByIdAndOwnerId(id, CurrentUser.id(jwt)).orElseThrow(() -> new NotFoundException("Category"));
    }
}
