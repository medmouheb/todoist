package com.doable.category;

import com.doable.common.CurrentUser;
import com.doable.common.NotFoundException;
import com.doable.project.ProjectDtos;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
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

/**
 * Your categories, as a tree under the implicit "Todos" root. Moves and renames are kept in
 * each category's history.
 */
@RestController
@RequestMapping("/api/categories")
public class CategoryController {

    /** Categories can nest this deep under "Todos". */
    static final int MAX_DEPTH = 6;

    /** parentId null puts it directly under "Todos". */
    public record CategoryRequest(@NotBlank @Size(max = 60) String name, @Pattern(regexp = ProjectDtos.COLORS) String color,
                                  Long parentId) {
    }

    /** Ids of siblings (same parent) in their new order. */
    public record OrderRequest(@NotNull List<Long> ids) {
    }

    /** Moves a category under parentId (null = "Todos"), at index among its new siblings (end if null). */
    public record MoveRequest(Long parentId, @Min(0) Integer index) {
    }

    public record CategoryResponse(Long id, String name, String color, int position, Long parentId) {
        public static CategoryResponse of(Category c) {
            return new CategoryResponse(c.getId(), c.getName(), c.getColor(), c.getPosition(), c.getParentId());
        }
    }

    public record HistoryResponse(Long id, String action, String from, String to, Instant createdAt) {
    }

    private final CategoryRepository categories;
    private final CategoryHistoryRepository history;

    public CategoryController(CategoryRepository categories, CategoryHistoryRepository history) {
        this.categories = categories;
        this.history = history;
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
        Map<Long, Category> mine = mine(owner);
        if (req.parentId() != null) checkParent(mine, null, req.parentId());
        Category c = new Category(owner, name, req.color() == null ? "slate" : req.color(),
                (int) mine.values().stream().filter(x -> Objects.equals(x.getParentId(), req.parentId())).count());
        c.setParentId(req.parentId());
        categories.save(c);
        history.save(new CategoryHistory(c.getId(), CategoryHistory.Action.CREATED, null, path(mine, c.getParentId())));
        return CategoryResponse.of(c);
    }

    /** Renames or recolors; send parentId only through {@link #move}. */
    @PutMapping("/{id}")
    @Transactional
    public CategoryResponse update(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id, @Valid @RequestBody CategoryRequest req) {
        long owner = CurrentUser.id(jwt);
        Category c = get(owner, id);
        String name = req.name().trim();
        if (!name.equalsIgnoreCase(c.getName()) && categories.existsByOwnerIdAndNameIgnoreCase(owner, name)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "You already have a category called “" + name + "”.");
        }
        if (!name.equals(c.getName())) {
            history.save(new CategoryHistory(c.getId(), CategoryHistory.Action.RENAMED, c.getName(), name));
            c.setName(name);
        }
        if (req.color() != null) c.setColor(req.color());
        return CategoryResponse.of(c);
    }

    /** Puts a category under another one (or under "Todos") at a given place. */
    @PutMapping("/{id}/move")
    @Transactional
    public List<CategoryResponse> move(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id, @Valid @RequestBody MoveRequest req) {
        long owner = CurrentUser.id(jwt);
        Map<Long, Category> mine = mine(owner);
        Category c = mine.get(id);
        if (c == null) throw new NotFoundException("Category");
        if (req.parentId() != null) checkParent(mine, c, req.parentId());

        Long from = c.getParentId();
        List<Category> siblings = new ArrayList<>(mine.values().stream()
                .filter(x -> Objects.equals(x.getParentId(), req.parentId()) && !x.getId().equals(id))
                .sorted(java.util.Comparator.comparingInt(Category::getPosition).thenComparing(Category::getId))
                .toList());
        int at = req.index() == null ? siblings.size() : Math.min(req.index(), siblings.size());
        siblings.add(at, c);
        c.setParentId(req.parentId());
        for (int i = 0; i < siblings.size(); i++) siblings.get(i).setPosition(i);
        if (!Objects.equals(from, req.parentId())) {
            // Close the gap it left.
            List<Category> old = mine.values().stream().filter(x -> Objects.equals(x.getParentId(), from) && x != c)
                    .sorted(java.util.Comparator.comparingInt(Category::getPosition).thenComparing(Category::getId)).toList();
            for (int i = 0; i < old.size(); i++) old.get(i).setPosition(i);
            history.save(new CategoryHistory(c.getId(), CategoryHistory.Action.MOVED, path(mine, from), path(mine, req.parentId())));
        }
        return mine.values().stream()
                .sorted(java.util.Comparator.comparingInt(Category::getPosition).thenComparing(Category::getId))
                .map(CategoryResponse::of).toList();
    }

    /** Sets the order of sibling categories. */
    @PutMapping("/order")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void reorder(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody OrderRequest req) {
        Map<Long, Category> mine = mine(CurrentUser.id(jwt));
        int pos = 0;
        for (Long id : req.ids()) {
            Category c = mine.get(id);
            if (c != null) c.setPosition(pos++);
        }
    }

    @GetMapping("/{id}/history")
    public List<HistoryResponse> history(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id) {
        get(CurrentUser.id(jwt), id);
        return history.findByCategoryIdOrderByIdDesc(id).stream()
                .map(h -> new HistoryResponse(h.getId(), h.getAction(), h.getFromValue(), h.getToValue(), h.getCreatedAt())).toList();
    }

    /** Its sub-categories move up to its parent; its tasks just lose the category. */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id) {
        long owner = CurrentUser.id(jwt);
        Map<Long, Category> mine = mine(owner);
        Category c = mine.get(id);
        if (c == null) throw new NotFoundException("Category");
        int next = (int) mine.values().stream().filter(x -> Objects.equals(x.getParentId(), c.getParentId())).count();
        for (Category child : mine.values()) {
            if (id.equals(child.getParentId())) {
                child.setParentId(c.getParentId());
                child.setPosition(next++);
                history.save(new CategoryHistory(child.getId(), CategoryHistory.Action.MOVED, path(mine, id), path(mine, c.getParentId())));
            }
        }
        categories.flush();
        categories.delete(c);
    }

    private Category get(long owner, Long id) {
        return categories.findByIdAndOwnerId(id, owner).orElseThrow(() -> new NotFoundException("Category"));
    }

    private Map<Long, Category> mine(long owner) {
        return categories.findByOwnerIdOrderByPositionAscIdAsc(owner).stream()
                .collect(Collectors.toMap(Category::getId, Function.identity(), (a, b) -> a, java.util.LinkedHashMap::new));
    }

    /** The parent must be yours, not the category itself or one inside it, and not too deep. */
    private static void checkParent(Map<Long, Category> mine, Category moving, Long parentId) {
        if (!mine.containsKey(parentId)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "That parent category isn’t one of yours.");
        int depth = 1;
        for (Long p = parentId; p != null; p = mine.get(p).getParentId()) {
            if (moving != null && p.equals(moving.getId())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A category can’t go inside itself or one of its own sub-categories.");
            }
            if (++depth > MAX_DEPTH) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Categories can only nest " + MAX_DEPTH + " levels deep.");
        }
    }

    /** "Todos › Work › Client" */
    private static String path(Map<Long, Category> mine, Long id) {
        List<String> names = new ArrayList<>();
        for (Long p = id; p != null && mine.containsKey(p); p = mine.get(p).getParentId()) names.addFirst(mine.get(p).getName());
        names.addFirst("Todos");
        return String.join(" › ", names);
    }
}
