package com.doable.task;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Repeat rules as people type them. Supported (case-insensitive):
 * "every day", "every weekday", "every week", "every month", "every year",
 * "every 3 days" / "every 2 weeks" / "every 6 months", and "every monday" … "every sun".
 * The frontend has the same rules in core/recurrence.ts.
 */
public final class Recurrence {

    private static final Pattern INTERVAL = Pattern.compile("every (?:(\\d{1,3}) )?(day|week|month|year)s?");
    private static final Pattern WEEKDAY =
            Pattern.compile("every (mon|tue|wed|thu|fri|sat|sun)[a-z]*");

    private Recurrence() {
    }

    public static boolean isValid(String rule) {
        return rule == null || rule.isBlank() || next(rule, LocalDate.of(2000, 1, 1)) != null;
    }

    /** Lower-cases and tidies the rule; null for "no repeat". */
    public static String normalize(String rule) {
        if (rule == null || rule.isBlank()) return null;
        return rule.trim().toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
    }

    /** The first date after {@code from} that matches the rule, or null if the rule is not understood. */
    public static LocalDate next(String rule, LocalDate from) {
        String r = normalize(rule);
        if (r == null) return null;
        if (r.equals("every weekday")) {
            LocalDate d = from.plusDays(1);
            while (d.getDayOfWeek() == DayOfWeek.SATURDAY || d.getDayOfWeek() == DayOfWeek.SUNDAY) d = d.plusDays(1);
            return d;
        }
        Matcher m = INTERVAL.matcher(r);
        if (m.matches()) {
            int n = m.group(1) == null ? 1 : Integer.parseInt(m.group(1));
            if (n < 1) return null;
            return switch (m.group(2)) {
                case "day" -> from.plusDays(n);
                case "week" -> from.plusWeeks(n);
                case "month" -> from.plusMonths(n);
                default -> from.plusYears(n);
            };
        }
        m = WEEKDAY.matcher(r);
        if (m.matches()) {
            DayOfWeek target = switch (m.group(1)) {
                case "mon" -> DayOfWeek.MONDAY;
                case "tue" -> DayOfWeek.TUESDAY;
                case "wed" -> DayOfWeek.WEDNESDAY;
                case "thu" -> DayOfWeek.THURSDAY;
                case "fri" -> DayOfWeek.FRIDAY;
                case "sat" -> DayOfWeek.SATURDAY;
                default -> DayOfWeek.SUNDAY;
            };
            LocalDate d = from.plusDays(1);
            while (d.getDayOfWeek() != target) d = d.plusDays(1);
            return d;
        }
        return null;
    }

    /**
     * Where a recurring task goes when it's completed: the next occurrence after its current date,
     * skipping any that are already in the past.
     */
    public static LocalDate advance(String rule, LocalDate due, LocalDate today) {
        if (due == null) {
            // First occurrence: "every week" starts today; "every monday" on the next Monday (today if it is one).
            return INTERVAL.matcher(normalize(rule)).matches() ? today : next(rule, today.minusDays(1));
        }
        LocalDate d = next(rule, due);
        while (d != null && d.isBefore(today)) d = next(rule, d);
        return d;
    }
}
