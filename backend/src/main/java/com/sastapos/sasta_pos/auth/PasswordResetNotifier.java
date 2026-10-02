package com.sastapos.sasta_pos.auth;

import com.sastapos.sasta_pos.user.User;


/**
 * Delivers a password-reset token to the user out of band (email/SMS/etc). The raw token must never be
 * logged or returned by the API; implementations are responsible for choosing the delivery channel.
 */
public interface PasswordResetNotifier {

    void sendResetToken(User user, String rawToken);

}
