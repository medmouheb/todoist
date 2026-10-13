package com.doable.label;

import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class LabelService {

    private static final String[] COLORS = {"moss", "clay", "sky", "plum", "sun", "rose", "slate", "teal", "lime"};

    private final LabelRepository labels;

    public LabelService(LabelRepository labels) {
        this.labels = labels;
    }

    /** Labels can be created just by typing them ("@errands"), so unknown names are created on the spot. */
    @Transactional
    public Label findOrCreate(Long ownerId, String rawName) {
        String name = rawName.trim().replaceFirst("^@", "");
        return labels.findByOwnerIdAndNameIgnoreCase(ownerId, name).orElseGet(() ->
                labels.save(new Label(ownerId, name, COLORS[Math.floorMod(name.toLowerCase().hashCode(), COLORS.length)])));
    }

    @Transactional
    public Set<Label> resolve(Long ownerId, Collection<String> names) {
        Set<Label> out = new LinkedHashSet<>();
        for (String n : names) {
            if (n != null && !n.isBlank()) out.add(findOrCreate(ownerId, n));
        }
        return out;
    }
}
