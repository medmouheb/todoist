package com.doable.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * @param appUrl      where the frontend lives, used for links in emails
 * @param mailFrom    sender for emails, e.g. "Doable &lt;hello@example.com&gt;"
 * @param brevoApiKey when set, emails are sent through Brevo's HTTPS API instead of SMTP
 * @param requireEmailVerification new accounts must confirm their email before they can log in
 * @param gmail       when all three values are set, emails are sent from a Gmail account through the Gmail API
 */
@ConfigurationProperties(prefix = "doable")
public record AppProperties(String appUrl, String mailFrom, String brevoApiKey, boolean requireEmailVerification, Gmail gmail) {

    /** OAuth client and refresh token for the Gmail account that sends the emails. */
    public record Gmail(String clientId, String clientSecret, String refreshToken) {
        public boolean isSet() {
            return clientId != null && !clientId.isBlank()
                    && clientSecret != null && !clientSecret.isBlank()
                    && refreshToken != null && !refreshToken.isBlank();
        }
    }
}
