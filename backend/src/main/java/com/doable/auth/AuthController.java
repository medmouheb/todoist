package com.doable.auth;

import com.doable.auth.AuthDtos.AuthResponse;
import com.doable.auth.AuthDtos.EmailRequest;
import com.doable.auth.AuthDtos.LoginRequest;
import com.doable.auth.AuthDtos.MessageResponse;
import com.doable.auth.AuthDtos.ResetPasswordRequest;
import com.doable.auth.AuthDtos.SignupRequest;
import com.doable.auth.AuthDtos.TokenRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private static final MessageResponse CHECK_EMAIL =
            new MessageResponse("If an account exists for that email, we've sent it a link.");

    private final AuthService auth;

    public AuthController(AuthService auth) {
        this.auth = auth;
    }

    @PostMapping("/signup")
    @ResponseStatus(HttpStatus.CREATED)
    public AuthResponse signup(@Valid @RequestBody SignupRequest req) {
        return auth.signup(req);
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest req) {
        return auth.login(req);
    }

    @PostMapping("/forgot-password")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public MessageResponse forgotPassword(@Valid @RequestBody EmailRequest req) {
        auth.forgotPassword(req.email());
        return CHECK_EMAIL;
    }

    @PostMapping("/reset-password")
    public AuthResponse resetPassword(@Valid @RequestBody ResetPasswordRequest req) {
        return auth.resetPassword(req);
    }

    @PostMapping("/login-link")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public MessageResponse loginLink(@Valid @RequestBody EmailRequest req) {
        auth.sendLoginLink(req.email());
        return CHECK_EMAIL;
    }

    @PostMapping("/login-link/verify")
    public AuthResponse verifyLoginLink(@Valid @RequestBody TokenRequest req) {
        return auth.loginWithLink(req.token());
    }
}
