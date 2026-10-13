package com.doable.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * @param appUrl   where the frontend lives, used for links in emails
 * @param mailFrom sender address for emails
 */
@ConfigurationProperties(prefix = "doable")
public record AppProperties(String appUrl, String mailFrom) {
}
