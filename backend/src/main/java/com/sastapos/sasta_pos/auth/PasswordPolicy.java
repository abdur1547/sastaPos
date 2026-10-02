package com.sastapos.sasta_pos.auth;

import com.sastapos.sasta_pos.util.BadRequestException;
import java.util.regex.Pattern;


/**
 * Centralizes the password strength rules enforced on signup, change-password, and password reset.
 */
public final class PasswordPolicy {

    private static final int MIN_LENGTH = 8;
    private static final Pattern HAS_LETTER = Pattern.compile("[A-Za-z]");
    private static final Pattern HAS_DIGIT = Pattern.compile("\\d");

    private PasswordPolicy() {
    }

    public static void validate(final String password) {
        if (password == null
                || password.length() < MIN_LENGTH
                || !HAS_LETTER.matcher(password).find()
                || !HAS_DIGIT.matcher(password).find()) {
            throw new BadRequestException("Password must be at least " + MIN_LENGTH
                    + " characters long and contain at least one letter and one digit.");
        }
    }

}
