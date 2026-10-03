package com.sastapos.sasta_pos.auth.support;

import com.sastapos.sasta_pos.auth.PasswordResetNotifier;
import com.sastapos.sasta_pos.user.User;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;


/**
 * Test double for {@link PasswordResetNotifier} that captures every raw reset token in memory so
 * end-to-end specs can drive the complete-reset flow without a real email provider.
 */
public class RecordingPasswordResetNotifier implements PasswordResetNotifier {

    private final Map<String, List<String>> tokensByEmail = new ConcurrentHashMap<>();

    @Override
    public void sendResetToken(final User user, final String rawToken) {
        tokensByEmail.computeIfAbsent(normalize(user.getEmail()), key -> new CopyOnWriteArrayList<>())
                .add(rawToken);
    }

    public String lastTokenFor(final String email) {
        final List<String> tokens = tokensByEmail.get(normalize(email));
        return (tokens == null || tokens.isEmpty()) ? null : tokens.getLast();
    }

    public int tokenCountFor(final String email) {
        final List<String> tokens = tokensByEmail.get(normalize(email));
        return tokens == null ? 0 : tokens.size();
    }

    public void reset() {
        tokensByEmail.clear();
    }

    private String normalize(final String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

}
