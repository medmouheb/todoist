package com.doable.auth;

import com.doable.auth.AuthDtos.AuthResponse;
import com.doable.auth.AuthDtos.LoginRequest;
import com.doable.auth.AuthDtos.ResetPasswordRequest;
import com.doable.auth.AuthDtos.SignupRequest;
import com.doable.auth.AuthToken.Purpose;
import com.doable.config.AppProperties;
import com.doable.mail.MailService;
import com.doable.notification.NotificationService;
import com.doable.project.ProjectService;
import com.doable.user.User;
import com.doable.user.UserRepository;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.ErrorResponseException;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);
    private static final Duration RESET_TTL = Duration.ofHours(1);
    private static final Duration LOGIN_LINK_TTL = Duration.ofMinutes(15);
    private static final Duration CODE_TTL = Duration.ofMinutes(30);
    private static final Duration VERIFY_LINK_TTL = Duration.ofHours(24);
    /** A new verification email can be requested this often. */
    private static final Duration RESEND_EVERY = Duration.ofSeconds(60);
    private static final SecureRandom RANDOM = new SecureRandom();

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final TokenService tokens;
    private final ProjectService projects;
    private final AuthTokenRepository authTokens;
    private final MailService mail;
    private final NotificationService notifications;
    private final AppProperties app;

    public AuthService(UserRepository users, PasswordEncoder passwordEncoder, TokenService tokens,
                       ProjectService projects, AuthTokenRepository authTokens, MailService mail,
                       NotificationService notifications, AppProperties app) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.tokens = tokens;
        this.projects = projects;
        this.authTokens = authTokens;
        this.mail = mail;
        this.notifications = notifications;
        this.app = app;
    }

    /**
     * Creates the account and emails a verification code and link. The person can't log in until
     * they confirm the address. Signing up again with an address that was never confirmed (a typo
     * in the password, an abandoned attempt) replaces the details and sends a fresh code.
     */
    @Transactional
    public AuthResponse signup(SignupRequest req) {
        String email = req.email().trim().toLowerCase();
        boolean organization = "ORGANIZATION".equals(req.accountType());
        if (organization && (req.organizationName() == null || req.organizationName().isBlank())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter your organization’s name.");
        }
        User user = users.findByEmailIgnoreCase(email).orElse(null);
        if (user != null && user.isEmailVerified()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "An account with this email already exists. Log in instead.");
        }
        boolean isNew = user == null;
        if (isNew) {
            user = new User(email, req.name().trim(), passwordEncoder.encode(req.password()));
        } else {
            user.setName(req.name().trim());
            user.setPasswordHash(passwordEncoder.encode(req.password()));
        }
        user.setAccountType(req.accountType());
        user.setUseCase(organization ? null : req.useCase());
        user.setOrganizationName(organization ? req.organizationName().trim() : null);
        user.setTeamSize(organization ? req.teamSize() : null);
        user.setJobTitle(organization ? blankToNull(req.jobTitle()) : null);
        user = users.save(user);
        if (isNew) {
            projects.createInbox(user.getId());
            notifications.pendingInvitesFor(user);
        }

        if (!app.requireEmailVerification()) {
            user.markEmailVerified();
            return AuthResponse.signedIn(tokens.issue(user), user);
        }
        sendVerification(user);
        return AuthResponse.mustVerify(user);
    }

    @Transactional(readOnly = true)
    public AuthResponse login(LoginRequest req) {
        User user = users.findByEmailIgnoreCase(req.email().trim())
                .filter(u -> passwordEncoder.matches(req.password(), u.getPasswordHash()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                        "Email or password is incorrect."));
        if (!user.isEmailVerified() && app.requireEmailVerification()) {
            // The client shows the code screen for this one.
            ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN,
                    "Please confirm your email address first. We sent a code to " + user.getEmail() + ".");
            pd.setTitle("Email not verified");
            pd.setType(URI.create("urn:doable:email-not-verified"));
            pd.setProperty("code", "EMAIL_NOT_VERIFIED");
            throw new ErrorResponseException(HttpStatus.FORBIDDEN, pd, null);
        }
        return issue(user);
    }

    // ---- email verification ----

    /** Checks the 6-digit code from the email. A few wrong guesses use the code up. */
    @Transactional(noRollbackFor = ResponseStatusException.class)
    public AuthResponse verifyCode(String email, String code) {
        User user = users.findByEmailIgnoreCase(email.trim())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "That code isn’t right."));
        // Never sign anyone in here once the address is confirmed: a code is only proof of the
        // inbox while verification is pending, and must not become a way around the password.
        if (user.isEmailVerified()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This email is already confirmed. Please log in.");
        }
        AuthToken latest = authTokens.findFirstByUserIdAndPurposeOrderByCreatedAtDesc(user.getId(), Purpose.EMAIL_CODE)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Send yourself a new code."));
        if (!latest.usable(Purpose.EMAIL_CODE)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    latest.getAttempts() >= AuthToken.MAX_ATTEMPTS
                            ? "Too many wrong tries. Send yourself a new code."
                            : "This code has expired. Send yourself a new one.");
        }
        if (!sha256(user.getId() + ":" + code).equals(tokenHashOf(latest))) {
            latest.failedAttempt();
            int left = AuthToken.MAX_ATTEMPTS - latest.getAttempts();
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, left > 0
                    ? "That code isn’t right. " + left + (left == 1 ? " try" : " tries") + " left."
                    : "Too many wrong tries. Send yourself a new code.");
        }
        latest.markUsed();
        return verified(user);
    }

    /** The one-click link in the verification email. */
    @Transactional
    public AuthResponse verifyLink(String token) {
        return verified(consume(token, Purpose.EMAIL_VERIFY));
    }

    /** Sends a fresh code and link. Says the same thing whether or not the account exists. */
    @Transactional
    public void resendVerification(String email) {
        users.findByEmailIgnoreCase(email.trim()).filter(u -> !u.isEmailVerified()).ifPresent(u -> {
            authTokens.findFirstByUserIdAndPurposeOrderByCreatedAtDesc(u.getId(), Purpose.EMAIL_CODE)
                    .filter(t -> t.getCreatedAt().isAfter(Instant.now().minus(RESEND_EVERY)))
                    .ifPresent(t -> {
                        long wait = RESEND_EVERY.minus(Duration.between(t.getCreatedAt(), Instant.now())).toSeconds() + 1;
                        throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                                "Please wait " + wait + " seconds before asking for another code.");
                    });
            sendVerification(u);
        });
    }

    private void sendVerification(User user) {
        authTokens.retire(user.getId(), List.of(Purpose.EMAIL_CODE, Purpose.EMAIL_VERIFY));
        String code = String.format("%06d", RANDOM.nextInt(1_000_000));
        authTokens.save(new AuthToken(user.getId(), sha256(user.getId() + ":" + code), Purpose.EMAIL_CODE,
                Instant.now().plus(CODE_TTL)));
        String link = newToken(user, Purpose.EMAIL_VERIFY, VERIFY_LINK_TTL);
        if (!mail.isConfigured()) {
            log.warn("Email isn't set up, so {} can't receive their code. Code for local testing: {}", user.getEmail(), code);
        }
        mail.send(user.getEmail(), code + " is your Doable code",
                "Hi " + user.getName() + ",\n\nWelcome to Doable! Enter this code to confirm your email address:\n\n"
                        + "    " + code.substring(0, 3) + " " + code.substring(3) + "\n\n"
                        + "It works for 30 minutes. Or confirm with one click:\n"
                        + mail.link("/verify-email?token=" + link)
                        + "\n\nIf you didn't create a Doable account, ignore this email.");
    }

    private AuthResponse verified(User user) {
        user.markEmailVerified();
        authTokens.retire(user.getId(), List.of(Purpose.EMAIL_CODE, Purpose.EMAIL_VERIFY));
        return issue(user);
    }

    // ---- password reset and login links ----

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

    /** Opening the email proves the address is theirs, so this also verifies it. */
    @Transactional
    public AuthResponse resetPassword(ResetPasswordRequest req) {
        User user = consume(req.token(), Purpose.PASSWORD_RESET);
        user.setPasswordHash(passwordEncoder.encode(req.password()));
        user.markEmailVerified();
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

    /** Opening the email proves the address is theirs, so this also verifies it. */
    @Transactional
    public AuthResponse loginWithLink(String token) {
        User user = consume(token, Purpose.LOGIN_LINK);
        user.markEmailVerified();
        return issue(user);
    }

    // ---- helpers ----

    private AuthResponse issue(User user) {
        return AuthResponse.signedIn(tokens.issue(user), user);
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

    private static String tokenHashOf(AuthToken t) {
        return t.getTokenHash();
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
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
