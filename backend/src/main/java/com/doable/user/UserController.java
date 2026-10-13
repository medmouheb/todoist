package com.doable.user;

import com.doable.auth.AuthDtos.UserResponse;
import com.doable.common.CurrentUser;
import com.doable.common.NotFoundException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/** The signed-in person's profile, settings, password and data export. */
@RestController
@RequestMapping("/api/me")
public class UserController {

    public record SettingsRequest(
            @Size(min = 1, max = 120) String name,
            @Pattern(regexp = "system|light|dark") String theme,
            @Pattern(regexp = "24h|12h") String timeFormat,
            @Min(0) @Max(1) Integer weekStart,
            @Pattern(regexp = "today|inbox|upcoming") String homeView) {
    }

    public record PasswordRequest(@NotBlank String currentPassword, @NotBlank @Size(min = 8, max = 100) String newPassword) {
    }

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final ExportService export;

    public UserController(UserRepository users, PasswordEncoder passwordEncoder, ExportService export) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.export = export;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public UserResponse me(@AuthenticationPrincipal Jwt jwt) {
        return UserResponse.of(user(jwt));
    }

    @PutMapping
    @Transactional
    public UserResponse update(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody SettingsRequest req) {
        User u = user(jwt);
        if (req.name() != null && !req.name().isBlank()) u.setName(req.name().trim());
        if (req.theme() != null) u.setTheme(req.theme());
        if (req.timeFormat() != null) u.setTimeFormat(req.timeFormat());
        if (req.weekStart() != null) u.setWeekStart(req.weekStart().shortValue());
        if (req.homeView() != null) u.setHomeView(req.homeView());
        return UserResponse.of(u);
    }

    @PutMapping("/password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void changePassword(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody PasswordRequest req) {
        User u = user(jwt);
        if (!passwordEncoder.matches(req.currentPassword(), u.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Your current password is incorrect.");
        }
        u.setPasswordHash(passwordEncoder.encode(req.newPassword()));
    }

    /** Everything this person can see, as JSON, for backups or moving elsewhere. */
    @GetMapping("/export")
    public Map<String, Object> exportData(@AuthenticationPrincipal Jwt jwt) {
        return export.export(CurrentUser.id(jwt));
    }

    private User user(Jwt jwt) {
        return users.findById(CurrentUser.id(jwt)).orElseThrow(() -> new NotFoundException("User"));
    }
}
