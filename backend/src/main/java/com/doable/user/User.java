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

    /** INDIVIDUAL or ORGANIZATION, chosen when signing up. */
    @Column(name = "account_type", nullable = false)
    private String accountType = "INDIVIDUAL";

    /** Individuals: what they mainly use Doable for. */
    @Column(name = "use_case")
    private String useCase;

    @Column(name = "organization_name")
    private String organizationName;

    @Column(name = "team_size")
    private String teamSize;

    @Column(name = "job_title")
    private String jobTitle;

    /** Set once the person proves the email address is theirs; they can't log in before that. */
    @Column(name = "email_verified_at")
    private Instant emailVerifiedAt;

    /** IANA time zone, e.g. "Africa/Tunis"; reminders fire in this zone. */
    @Column(name = "time_zone", nullable = false)
    private String timeZone = "UTC";

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
    public String getTimeZone() { return timeZone; }
    public void setTimeZone(String timeZone) { this.timeZone = timeZone; }
    public String getAccountType() { return accountType; }
    public void setAccountType(String accountType) { this.accountType = accountType; }
    public String getUseCase() { return useCase; }
    public void setUseCase(String useCase) { this.useCase = useCase; }
    public String getOrganizationName() { return organizationName; }
    public void setOrganizationName(String organizationName) { this.organizationName = organizationName; }
    public String getTeamSize() { return teamSize; }
    public void setTeamSize(String teamSize) { this.teamSize = teamSize; }
    public String getJobTitle() { return jobTitle; }
    public void setJobTitle(String jobTitle) { this.jobTitle = jobTitle; }
    public Instant getEmailVerifiedAt() { return emailVerifiedAt; }
    public boolean isEmailVerified() { return emailVerifiedAt != null; }
    public void markEmailVerified() { if (emailVerifiedAt == null) emailVerifiedAt = Instant.now(); }
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
