package com.doable.auth;

import com.doable.user.User;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class AuthDtos {

    private AuthDtos() {
    }

    public record SignupRequest(
            @NotBlank @Size(max = 120) String name,
            @NotBlank @Email @Size(max = 255) String email,
            @NotBlank @Size(min = 8, max = 100) String password) {
    }

    public record LoginRequest(@NotBlank @Email String email, @NotBlank String password) {
    }

    /** For "forgot password" and "email me a login link". */
    public record EmailRequest(@NotBlank @Email String email) {
    }

    public record TokenRequest(@NotBlank String token) {
    }

    public record ResetPasswordRequest(@NotBlank String token, @NotBlank @Size(min = 8, max = 100) String password) {
    }

    public record UserResponse(Long id, String email, String name, String initials, String theme,
                               String timeFormat, int weekStart, String homeView, String timeZone) {
        public static UserResponse of(User u) {
            return new UserResponse(u.getId(), u.getEmail(), u.getName(), User.initials(u.getName()), u.getTheme(),
                    u.getTimeFormat(), u.getWeekStart(), u.getHomeView(), u.getTimeZone());
        }
    }

    public record AuthResponse(String token, UserResponse user) {
    }

    public record MessageResponse(String message) {
    }
}
