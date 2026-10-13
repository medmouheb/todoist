package com.doable.auth;

import com.doable.auth.AuthDtos.AuthResponse;
import com.doable.auth.AuthDtos.LoginRequest;
import com.doable.auth.AuthDtos.SignupRequest;
import com.doable.auth.AuthDtos.UserResponse;
import com.doable.project.ProjectService;
import com.doable.user.User;
import com.doable.user.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AuthService {

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final TokenService tokens;
    private final ProjectService projects;

    public AuthService(UserRepository users, PasswordEncoder passwordEncoder, TokenService tokens,
                       ProjectService projects) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.tokens = tokens;
        this.projects = projects;
    }

    @Transactional
    public AuthResponse signup(SignupRequest req) {
        String email = req.email().trim().toLowerCase();
        if (users.existsByEmailIgnoreCase(email)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "An account with this email already exists.");
        }
        User user = users.save(new User(email, req.name().trim(), passwordEncoder.encode(req.password())));
        projects.createInbox(user.getId());
        return new AuthResponse(tokens.issue(user), UserResponse.of(user));
    }

    @Transactional(readOnly = true)
    public AuthResponse login(LoginRequest req) {
        User user = users.findByEmailIgnoreCase(req.email().trim())
                .filter(u -> passwordEncoder.matches(req.password(), u.getPasswordHash()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                        "Email or password is incorrect."));
        return new AuthResponse(tokens.issue(user), UserResponse.of(user));
    }
}
