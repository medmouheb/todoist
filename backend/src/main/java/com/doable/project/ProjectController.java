package com.doable.project;

import com.doable.common.CurrentUser;
import com.doable.project.ProjectDtos.ProjectRequest;
import com.doable.project.ProjectDtos.ProjectResponse;
import com.doable.task.ProjectToolsService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
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
@RequestMapping("/api/projects")
public class ProjectController {

    private final ProjectService projects;
    private final ProjectToolsService tools;

    public ProjectController(ProjectService projects, ProjectToolsService tools) {
        this.projects = projects;
        this.tools = tools;
    }

    /** Every project the user is a member of, archived ones included (they have archived=true). */
    @GetMapping
    public List<ProjectResponse> list(@AuthenticationPrincipal Jwt jwt) {
        return projects.list(CurrentUser.id(jwt));
    }

    @GetMapping("/{id}")
    public ProjectResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id) {
        return projects.get(CurrentUser.id(jwt), id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ProjectResponse create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ProjectRequest req) {
        return projects.create(CurrentUser.id(jwt), req);
    }

    /** Send only what changes. name, color and archived need an admin; favorite is personal. */
    @PutMapping("/{id}")
    public ProjectResponse update(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id,
                                  @Valid @RequestBody ProjectRequest req) {
        return projects.update(CurrentUser.id(jwt), id, req);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id) {
        projects.delete(CurrentUser.id(jwt), id);
    }

    @PostMapping("/{id}/duplicate")
    @ResponseStatus(HttpStatus.CREATED)
    public ProjectResponse duplicate(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id) {
        return tools.duplicate(CurrentUser.id(jwt), id);
    }

    /** The project's open tasks as a CSV template. */
    @GetMapping(value = "/{id}/export", produces = "text/csv")
    public ResponseEntity<String> export(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id) {
        String name = projects.get(CurrentUser.id(jwt), id).name().replaceAll("[^A-Za-z0-9 _-]", "").trim();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + (name.isEmpty() ? "project" : name) + ".csv\"")
                .contentType(new MediaType("text", "csv", java.nio.charset.StandardCharsets.UTF_8))
                .body(tools.exportCsv(CurrentUser.id(jwt), id));
    }

    /** Body is CSV text (see the export for the columns). */
    @PostMapping(value = "/{id}/import", consumes = {"text/csv", "text/plain"})
    public Map<String, Integer> importCsv(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id,
                                          @RequestBody String csv) {
        return Map.of("added", tools.importCsv(CurrentUser.id(jwt), id, csv));
    }
}
