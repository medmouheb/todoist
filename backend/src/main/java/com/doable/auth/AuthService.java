package com.doable.auth;

import com.doable.auth.AuthDtos.AuthResponse;
import com.doable.auth.AuthDtos.LoginRequest;
import com.doable.auth.AuthDtos.ResetPasswordRequest;
import com.doable.auth.AuthDtos.SignupRequest;
import com.doable.auth.AuthDtos.UserResponse;
import com.doable.auth.AuthToken.Purpose;
import com.doable.mail.MailService;
import com.doable.notification.NotificationService;
import com.doable.project.ProjectService;
import com.doable.user.User;
import com.doable.user.UserRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AuthService {

    private static final Duration RESET_TTL = Duration.ofHours(1);
    private static final Duration LOGIN_LINK_TTL = Duration.ofMinutes(15);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final TokenService tokens;
    private final ProjectService projects;
    private final AuthTokenRepository authTokens;
    private final MailService mail;
    private final NotificationService notifications;

    public AuthService(UserRepository users, PasswordEncoder passwordEncoder, TokenService tokens,
                       ProjectService projects, AuthTokenRepository authTokens, MailService mail,
                       NotificationService notifications) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.tokens = tokens;
        this.projects = projects;
        this.authTokens = authTokens;
        this.mail = mail;
        this.notifications = notifications;
    }

    @Transactional
    public AuthResponse signup(SignupRequest req) {
        String email = req.email().trim().toLowerCase();
        if (users.existsByEmailIgnoreCase(email)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "An account with this email already exists.");
        }
        User user = users.save(new User(email, req.name().trim(), passwordEncoder.encode(req.password())));
        projects.createInbox(user.getId());
        notifications.pendingInvitesFor(user);
        return issue(user);
    }

    @Transactional(readOnly = true)
    public AuthResponse login(LoginRequest req) {
        User user = users.findByEmailIgnoreCase(req.email().trim())
                .filter(u -> passwordEncoder.matches(req.password(), u.getPasswordHash()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                        "Email or password is incorrect."));
        return issue(user);
    }

    /** Always succeeds, so nobody can find out which emails have accounts. */
    @Transactional
    public void forgotPassword(String email) {
        users.findByEmailIgnoreCase(email.trim()).ifPresent(u -> {
            String token = newToken(u, Purpose.PASSWORD_RESET, RESET_TTL);
            mail.send(u.getEmail(), "Reset your Doable password",
                    "Hi " + u.getName() + ",\n\nSomeone asked to reset the password for this account. "
                            + "If it was you, open this link within an hour:\n\n"
                            + mail.link("/reset-password?token=" + token)
                            + "\n\nIf it wasn't you, ignore this email; your password stays the same.");
        });
    }

    @Transactional
    public AuthResponse resetPassword(ResetPasswordRequest req) {
        User user = consume(req.token(), Purpose.PASSWORD_RESET);
        user.setPasswordHash(passwordEncoder.encode(req.password()));
        return issue(user);
    }

    /** Always succeeds, so nobody can find out which emails have accounts. */
    @Transactional
    public void sendLoginLink(String email) {
        users.findByEmailIgnoreCase(email.trim()).ifPresent(u -> {
            String token = newToken(u, Purpose.LOGIN_LINK, LOGIN_LINK_TTL);
            mail.send(u.getEmail(), "Your Doable login link",
                    "Hi " + u.getName() + ",\n\nOpen this link within 15 minutes to log in:\n\n"
                            + mail.link("/login/link?token=" + token)
                            + "\n\nIf you didn't ask for it, ignore this email.");
        });
    }

    @Transactional
    public AuthResponse loginWithLink(String token) {
        return issue(consume(token, Purpose.LOGIN_LINK));
    }

    private AuthResponse issue(User user) {
        return new AuthResponse(tokens.issue(user), UserResponse.of(user));
    }

    private String newToken(User user, Purpose purpose, Duration ttl) {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        authTokens.save(new AuthToken(user.getId(), sha256(token), purpose, Instant.now().plus(ttl)));
        return token;
    }

    private User consume(String token, Purpose purpose) {
        AuthToken t = authTokens.findByTokenHash(sha256(token))
                .filter(x -> x.usable(purpose))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "This link has expired or was already used. Please ask for a new one."));
        t.markUsed();
        return users.findById(t.getUserId()).orElseThrow();
    }

    private static String sha256(String s) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
