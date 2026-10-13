package com.doable.mail;

import com.doable.config.AppProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

/** Sends plain-text emails. In development they land in Mailpit (http://localhost:8025). */
@Service
public class MailService {

    private static final Logger log = LoggerFactory.getLogger(MailService.class);

    private static final String DEFAULT_FROM = "Doable <no-reply@doable.local>";

    private final JavaMailSender sender;
    private final AppProperties app;
    private final boolean configured;

    public MailService(JavaMailSender sender, AppProperties app, @Value("${spring.mail.host:}") String host) {
        this.sender = sender;
        this.app = app;
        this.configured = !host.isBlank();
        if (!configured) {
            log.warn("No mail server set (MAIL_HOST): password resets, login links and invites won't be emailed.");
        }
    }

    /** A link into the frontend, e.g. link("/reset-password?token=abc"). */
    public String link(String path) {
        return app.appUrl().replaceAll("/+$", "") + path;
    }

    /** Never fails the request: a mail outage is logged, not shown to the user. */
    public void send(String to, String subject, String body) {
        if (!configured) {
            log.info("Email not configured; skipped \"{}\" to {}", subject, to);
            return;
        }
        SimpleMailMessage msg = new SimpleMailMessage();
        msg.setFrom(app.mailFrom() == null || app.mailFrom().isBlank() ? DEFAULT_FROM : app.mailFrom());
        msg.setTo(to);
        msg.setSubject(subject);
        msg.setText(body + "\n\n— Doable");
        try {
            sender.send(msg);
        } catch (MailException e) {
            log.warn("Could not send \"{}\" to {}: {}", subject, to, e.getMessage());
        }
    }
}
