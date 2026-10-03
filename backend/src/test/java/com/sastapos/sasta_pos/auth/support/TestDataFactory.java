package com.sastapos.sasta_pos.auth.support;

import net.datafaker.Faker;


/**
 * Generates unique, realistic test data so specs never collide on unique columns and never
 * hardcode names/emails.
 */
public final class TestDataFactory {

    private static final Faker FAKER = new Faker();

    private TestDataFactory() {
    }

    public static String personName() {
        return FAKER.name().fullName();
    }

    public static String uniqueEmail() {
        return FAKER.internet().emailAddress();
    }

    /** Satisfies the password policy: 8+ chars, at least one letter and one digit. */
    public static String validPassword() {
        return FAKER.internet().password(9, 12, true, true, true);
    }

}
