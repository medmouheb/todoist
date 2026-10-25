package com.doable.mail;

import com.doable.config.AppProperties;
import jakarta.mail.Message;
import jakarta.mail.MessagingException;
import jakarta.mail.Session;
import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.Properties;
import org.springframework.http.MediaType;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

/**
 * Sends email from a Gmail account through the Gmail API. It is plain HTTPS, so it works where
 * SMTP is blocked (Render's free plan). Gmail sends as the account the refresh token belongs to.
 */
class GmailSender {

    private final AppProperties.Gmail gmail;
    private final RestClient http = RestClient.create();
    private String accessToken;
    private Instant expiresAt = Instant.EPOCH;

    GmailSender(AppProperties.Gmail gmail) {
        this.gmail = gmail;
    }

    void send(String from, String to, String subject, String text) throws MessagingException, IOException {
        MimeMessage msg = new MimeMessage(Session.getInstance(new Properties()));
        msg.setFrom(new InternetAddress(from));
        msg.setRecipient(Message.RecipientType.TO, new InternetAddress(to));
        msg.setSubject(subject, "UTF-8");
        msg.setText(text, "UTF-8");
        ByteArrayOutputStream raw = new ByteArrayOutputStream();
        msg.writeTo(raw);

        http.post()
                .uri("https://gmail.googleapis.com/gmail/v1/users/me/messages/send")
                .header("Authorization", "Bearer " + token())
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("raw", Base64.getUrlEncoder().encodeToString(raw.toByteArray())))
                .retrieve()
                .toBodilessEntity();
    }

    /** An access token lasts an hour; get a new one from the refresh token a minute before that. */
    private synchronized String token() {
        if (accessToken == null || Instant.now().isAfter(expiresAt)) {
            MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
            form.add("client_id", gmail.clientId());
            form.add("client_secret", gmail.clientSecret());
            form.add("refresh_token", gmail.refreshToken());
            form.add("grant_type", "refresh_token");
            Map<?, ?> res = http.post()
                    .uri("https://oauth2.googleapis.com/token")
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form)
                    .retrieve()
                    .body(Map.class);
            accessToken = (String) res.get("access_token");
            expiresAt = Instant.now().plusSeconds(((Number) res.get("expires_in")).longValue() - 60);
        }
        return accessToken;
    }
}
