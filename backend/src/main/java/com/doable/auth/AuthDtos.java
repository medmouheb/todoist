package com.doable.auth;

import com.doable.user.User;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public final class AuthDtos {

    private AuthDtos() {
    }

    /**
     * accountType is INDIVIDUAL or ORGANIZATION. Individuals may say what they'll use Doable for;
     * organizations must give the organization's name and may give the team size and their role.
     */
    public record SignupRequest(
            @NotBlank @Pattern(regexp = "INDIVIDUAL|ORGANIZATION") String accountType,
            @NotBlank @Size(max = 120) String name,
            @NotBlank @Email @Size(max = 255) String email,
            @NotBlank @Size(min = 8, max = 100) String password,
            @Pattern(regexp = "personal|work|study|freelance|other") String useCase,
            @Size(max = 120) String organizationName,
            @Pattern(regexp = "1-10|11-50|51-200|201-1000|1000\\+") String teamSize,
            @Size(max = 80) String jobTitle) {
    }

    public record LoginRequest(@NotBlank @Email String email, @NotBlank String password) {
    }

    /** For "forgot password", "email me a login link" and "send the code again". */
    public record EmailRequest(@NotBlank @Email String email) {
    }

    public record TokenRequest(@NotBlank String token) {
    }

    public record VerifyCodeRequest(@NotBlank @Email String email, @NotBlank @Pattern(regexp = "\\d{6}") String code) {
    }

    public record ResetPasswordRequest(@NotBlank String token, @NotBlank @Size(min = 8, max = 100) String password) {
    }

    public record UserResponse(Long id, String email, String name, String initials, String theme,
                               String timeFormat, int weekStart, String homeView, String timeZone,
                               String accountType, String useCase, String organizationName, String teamSize,
                               String jobTitle, boolean emailVerified) {
        public static UserResponse of(User u) {
            return new UserResponse(u.getId(), u.getEmail(), u.getName(), User.initials(u.getName()), u.getTheme(),
                    u.getTimeFormat(), u.getWeekStart(), u.getHomeView(), u.getTimeZone(), u.getAccountType(),
                    u.getUseCase(), u.getOrganizationName(), u.getTeamSize(), u.getJobTitle(), u.isEmailVerified());
        }
    }

    /**
     * After sign-up the token is null and verificationRequired is true until the email is confirmed
     * (unless verification is switched off).
     */
    public record AuthResponse(String token, UserResponse user, boolean verificationRequired) {
        public static AuthResponse signedIn(String token, User u) {
            return new AuthResponse(token, UserResponse.of(u), false);
        }

        public static AuthResponse mustVerify(User u) {
            return new AuthResponse(null, UserResponse.of(u), true);
        }
    }

    public record MessageResponse(String message) {
    }
}
