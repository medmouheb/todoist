package com.doable.config;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.env.EnvironmentPostProcessor;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

/**
 * Accepts the database as one DATABASE_URL, the way hosts like Neon and Render hand it out:
 * postgresql://user:password@host/dbname?sslmode=require
 * It's turned into Spring's JDBC url, username and password. DB_URL, DB_USER and DB_PASSWORD still
 * work when DATABASE_URL isn't set.
 */
public class DatabaseUrlEnvironment implements EnvironmentPostProcessor {

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment env, SpringApplication app) {
        String raw = env.getProperty("DATABASE_URL");
        if (raw == null || raw.isBlank()) return;

        URI uri = URI.create(raw.trim());
        if (uri.getScheme() == null || !uri.getScheme().startsWith("postgres")) {
            throw new IllegalStateException("DATABASE_URL must start with postgresql://");
        }
        String query = uri.getRawQuery() == null ? "" : Arrays.stream(uri.getRawQuery().split("&"))
                // The PostgreSQL JDBC driver spells this one differently; it's optional, so leave it out.
                .filter(p -> !p.startsWith("channel_binding="))
                .collect(Collectors.joining("&"));
        String jdbc = "jdbc:postgresql://" + uri.getHost() + (uri.getPort() > 0 ? ":" + uri.getPort() : "")
                + uri.getRawPath() + (query.isEmpty() ? "" : "?" + query);

        Map<String, Object> props = new HashMap<>();
        props.put("spring.datasource.url", jdbc);
        String userInfo = uri.getRawUserInfo();
        if (userInfo != null) {
            String[] parts = userInfo.split(":", 2);
            props.put("spring.datasource.username", decode(parts[0]));
            if (parts.length > 1) props.put("spring.datasource.password", decode(parts[1]));
        }
        env.getPropertySources().addFirst(new MapPropertySource("databaseUrl", props));
    }

    private static String decode(String s) {
        return URLDecoder.decode(s, StandardCharsets.UTF_8);
    }
}
