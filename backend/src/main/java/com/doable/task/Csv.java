package com.doable.task;

import java.util.ArrayList;
import java.util.List;

/** Minimal RFC 4180 CSV: quoted fields, doubled quotes, line breaks inside quotes. */
final class Csv {

    private Csv() {
    }

    static String row(Object... cells) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < cells.length; i++) {
            if (i > 0) sb.append(',');
            String s = cells[i] == null ? "" : String.valueOf(cells[i]);
            if (s.matches("(?s).*[\",\\r\\n].*") || s.startsWith(" ") || s.endsWith(" ")) {
                sb.append('"').append(s.replace("\"", "\"\"")).append('"');
            } else {
                sb.append(s);
            }
        }
        return sb.append("\r\n").toString();
    }

    static List<List<String>> parse(String text) {
        List<List<String>> rows = new ArrayList<>();
        List<String> row = new ArrayList<>();
        StringBuilder cell = new StringBuilder();
        boolean quoted = false;
        String s = text.startsWith("﻿") ? text.substring(1) : text;
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (quoted) {
                if (c == '"' && i + 1 < s.length() && s.charAt(i + 1) == '"') {
                    cell.append('"');
                    i++;
                } else if (c == '"') {
                    quoted = false;
                } else {
                    cell.append(c);
                }
            } else if (c == '"') {
                quoted = true;
            } else if (c == ',') {
                row.add(cell.toString());
                cell.setLength(0);
            } else if (c == '\n' || c == '\r') {
                if (c == '\r' && i + 1 < s.length() && s.charAt(i + 1) == '\n') i++;
                row.add(cell.toString());
                cell.setLength(0);
                if (!(row.size() == 1 && row.getFirst().isBlank())) rows.add(row);
                row = new ArrayList<>();
            } else {
                cell.append(c);
            }
        }
        if (cell.length() > 0 || !row.isEmpty()) {
            row.add(cell.toString());
            rows.add(row);
        }
        return rows;
    }
}
