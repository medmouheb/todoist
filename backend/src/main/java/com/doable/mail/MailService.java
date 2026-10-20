package com.doable.mail;

import com.doable.config.AppProperties;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Sends plain-text emails, by one of:
 * - Brevo's HTTPS API when BREVO_API_KEY is set (works where SMTP is blocked, like Render's free plan);
 * - SMTP otherwise. In development that's Mailpit (http://localhost:8025).
 */
@Service
public class MailService {

    private static final Logger log = LoggerFactory.getLogger(MailService.class);

    private static final String DEFAULT_FROM = "Doable <no-reply@doable.local>";
    private static final Pattern NAME_AND_ADDRESS = Pattern.compile("\\s*(.*?)\\s*<([^>]+)>\\s*");

    private final JavaMailSender sender;
    private final AppProperties app;
    private final boolean smtpConfigured;
    private final RestClient brevo;

    public MailService(JavaMailSender sender, AppProperties app, @Value("${spring.mail.host:}") String host) {
        this.sender = sender;
        this.app = app;
        this.smtpConfigured = !host.isBlank();
        boolean useBrevo = app.brevoApiKey() != null && !app.brevoApiKey().isBlank();
        this.brevo = useBrevo
                ? RestClient.builder().baseUrl("https://api.brevo.com/v3").defaultHeader("api-key", app.brevoApiKey()).build()
                : null;
        if (useBrevo) {
            log.info("Emails will be sent through the Brevo API.");
        } else if (!smtpConfigured) {
            log.warn("No mail server set (MAIL_HOST or BREVO_API_KEY): password resets, login links and invites won't be emailed.");
        }
    }

    /** A link into the frontend, e.g. link("/reset-password?token=abc"). */
    public String link(String path) {
        return app.appUrl().replaceAll("/+$", "") + path;
    }

    /** Never fails the request: a mail outage is logged, not shown to the user. */
    public void send(String to, String subject, String body) {
        String from = app.mailFrom() == null || app.mailFrom().isBlank() ? DEFAULT_FROM : app.mailFrom();
        String text = body + "\n\n— Doable";
        if (brevo != null) {
            sendWithBrevo(from, to, subject, text);
        } else if (smtpConfigured) {
            sendWithSmtp(from, to, subject, text);
        } else {
            log.info("Email not configured; skipped \"{}\" to {}", subject, to);
        }
    }

    private void sendWithSmtp(String from, String to, String subject, String text) {
        SimpleMailMessage msg = new SimpleMailMessage();
        msg.setFrom(from);
        msg.setTo(to);
        msg.setSubject(subject);
        msg.setText(text);
        try {
            sender.send(msg);
        } catch (MailException e) {
            log.warn("Could not send \"{}\" to {}: {}", subject, to, e.getMessage());
        }
    }

    private void sendWithBrevo(String from, String to, String subject, String text) {
        Matcher m = NAME_AND_ADDRESS.matcher(from);
        Map<String, String> fromParts = m.matches()
                ? Map.of("name", m.group(1).isEmpty() ? "Doable" : m.group(1), "email", m.group(2).trim())
                : Map.of("name", "Doable", "email", from.trim());
        Map<String, Object> payload = Map.of(
                "sender", fromParts,
                "to", List.of(Map.of("email", to)),
                "subject", subject,
                "textContent", text);
        try {
            brevo.post().uri("/smtp/email").contentType(MediaType.APPLICATION_JSON).body(payload).retrieve().toBodilessEntity();
        } catch (RestClientException e) {
            log.warn("Could not send \"{}\" to {} through Brevo: {}", subject, to, e.getMessage());
        }
    }
}
