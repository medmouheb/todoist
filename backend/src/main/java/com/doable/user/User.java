package com.doable.user;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(nullable = false)
    private String name;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    /** system, light or dark */
    @Column(nullable = false)
    private String theme = "system";

    /** 24h or 12h */
    @Column(name = "time_format", nullable = false)
    private String timeFormat = "24h";

    /** 1 = Monday, 0 = Sunday */
    @Column(name = "week_start", nullable = false)
    private short weekStart = 1;

    /** today, inbox or upcoming */
    @Column(name = "home_view", nullable = false)
    private String homeView = "today";

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    protected User() {
    }

    public User(String email, String name, String passwordHash) {
        this.email = email;
        this.name = name;
        this.passwordHash = passwordHash;
    }

    public Long getId() { return id; }
    public String getEmail() { return email; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }
    public String getTheme() { return theme; }
    public void setTheme(String theme) { this.theme = theme; }
    public String getTimeFormat() { return timeFormat; }
    public void setTimeFormat(String timeFormat) { this.timeFormat = timeFormat; }
    public short getWeekStart() { return weekStart; }
    public void setWeekStart(short weekStart) { this.weekStart = weekStart; }
    public String getHomeView() { return homeView; }
    public void setHomeView(String homeView) { this.homeView = homeView; }
    public Instant getCreatedAt() { return createdAt; }

    /** Initials for avatars, e.g. "Maya Andersen" → "MA". */
    public static String initials(String name) {
        StringBuilder sb = new StringBuilder();
        for (String w : name.trim().split("\\s+")) {
            if (!w.isEmpty() && sb.length() < 2) {
                sb.append(Character.toUpperCase(w.charAt(0)));
            }
        }
        return sb.toString();
    }
}
