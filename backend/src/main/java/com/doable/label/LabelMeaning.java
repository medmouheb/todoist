package com.doable.label;

import java.text.Normalizer;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Decides when two hashtags mean the same thing, so the same idea isn't tagged three ways:
 * case, accents, punctuation and plurals don't count ("Meetings", "meeting", "mééting"),
 * a few common synonyms are one word ("asap" = "urgent"), and near-identical spellings
 * ("meeeting") are flagged as likely duplicates.
 */
final class LabelMeaning {

    /** Each group means one thing; the first word is the one kept. */
    private static final List<List<String>> SYNONYMS = List.of(
            List.of("urgent", "asap", "rush", "emergency"),
            List.of("meeting", "mtg", "meet"),
            List.of("doc", "docs", "documentation"),
            List.of("dev", "development", "coding", "code"),
            List.of("email", "mail", "emails"),
            List.of("call", "phone", "phonecall"),
            List.of("admin", "administration", "paperwork"),
            List.of("design", "ux", "ui"),
            List.of("bug", "bugs", "bugfix"),
            List.of("idea", "ideas", "brainstorm"),
            List.of("waiting", "waitingfor", "blocked", "onhold"),
            List.of("shopping", "groceries", "errands"),
            List.of("health", "medical", "doctor"),
            List.of("finance", "money", "budget"),
            List.of("research", "investigate", "explore"));

    private static final Map<String, String> ROOT = new HashMap<>();

    static {
        for (List<String> group : SYNONYMS) for (String w : group) ROOT.put(w, group.getFirst());
    }

    private LabelMeaning() {
    }

    /** Lowercase, no accents, letters and digits only, singular. */
    static String normalize(String name) {
        String s = Normalizer.normalize(name, Normalizer.Form.NFD).replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
        if (s.length() > 4 && s.endsWith("ies")) return s.substring(0, s.length() - 3) + "y";
        if (s.length() > 4 && (s.endsWith("ses") || s.endsWith("xes") || s.endsWith("ches") || s.endsWith("shes"))) {
            return s.substring(0, s.length() - 2);
        }
        if (s.length() > 3 && s.endsWith("s") && !s.endsWith("ss")) return s.substring(0, s.length() - 1);
        return s;
    }

    /** One key per meaning: the normalized word, or its synonym group's first word. */
    static String key(String name) {
        String n = normalize(name);
        String raw = Normalizer.normalize(name, Normalizer.Form.NFD).replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
        return ROOT.getOrDefault(raw, ROOT.getOrDefault(n, n));
    }

    /** Why two names look like the same thing, or null when they don't. */
    static String sameMeaning(String a, String b) {
        String na = normalize(a);
        String nb = normalize(b);
        if (na.equals(nb)) return "Same word (case, accents or plural)";
        if (key(a).equals(key(b))) return "Synonyms";
        int len = Math.min(na.length(), nb.length());
        int d = distance(na, nb);
        if ((len >= 4 && d == 1) || (len >= 8 && d == 2)) return "Spelled almost the same";
        return null;
    }

    /** Edits to turn a into b, where swapping two neighbouring letters ("desing") counts as one typo. */
    static int distance(String a, String b) {
        int[][] d = new int[a.length() + 1][b.length() + 1];
        for (int i = 0; i <= a.length(); i++) d[i][0] = i;
        for (int j = 0; j <= b.length(); j++) d[0][j] = j;
        for (int i = 1; i <= a.length(); i++) {
            for (int j = 1; j <= b.length(); j++) {
                int cost = a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1;
                d[i][j] = Math.min(Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1), d[i - 1][j - 1] + cost);
                if (i > 1 && j > 1 && a.charAt(i - 1) == b.charAt(j - 2) && a.charAt(i - 2) == b.charAt(j - 1)) {
                    d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
                }
            }
        }
        return d[a.length()][b.length()];
    }
}
