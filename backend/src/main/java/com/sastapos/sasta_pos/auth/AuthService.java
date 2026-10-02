package com.sastapos.sasta_pos.auth;

import com.sastapos.sasta_pos.auth.dto.AuthResponse;
import com.sastapos.sasta_pos.auth.dto.AuthenticatedUserDTO;
import com.sastapos.sasta_pos.auth.dto.ChangePasswordRequest;
import com.sastapos.sasta_pos.auth.dto.LoginRequest;
import com.sastapos.sasta_pos.auth.dto.MessageResponse;
import com.sastapos.sasta_pos.auth.dto.PasswordResetCompleteRequest;
import com.sastapos.sasta_pos.auth.dto.PasswordResetRequest;
import com.sastapos.sasta_pos.auth.dto.SignupRequest;
import com.sastapos.sasta_pos.store.RowStatus;
import com.sastapos.sasta_pos.user.User;
import com.sastapos.sasta_pos.user.UserRepository;
import com.sastapos.sasta_pos.user.UserRole;
import com.sastapos.sasta_pos.util.BadRequestException;
import com.sastapos.sasta_pos.util.ConflictException;
import com.sastapos.sasta_pos.util.UnauthorizedException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;


@Service
@RequiredArgsConstructor
public class AuthService {

    private static final String INVALID_CREDENTIALS_MESSAGE = "Invalid email or password";
    private static final String GENERIC_RESET_REQUESTED_MESSAGE =
            "If an account exists for this email, password reset instructions have been sent.";
    private static final String INVALID_RESET_TOKEN_MESSAGE = "Invalid or expired token";

    private final UserRepository userRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final PasswordResetNotifier passwordResetNotifier;

    @Value("${app.password-reset.token-expiration-minutes}")
    private long resetTokenExpirationMinutes;

    @Transactional
    public AuthResponse signup(final SignupRequest request) {
        final String email = normalizeEmail(request.getEmail());
        if (userRepository.existsByEmailIgnoreCase(email)) {
            throw new ConflictException("An account with this email already exists");
        }
        PasswordPolicy.validate(request.getPassword());

        final User user = new User();
        user.setName(request.getName());
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        user.setRole(UserRole.CASHIER);
        user.setStatus(RowStatus.ACTIVE);
        user.setStore(null);
        userRepository.save(user);

        return buildAuthResponse(user);
    }

    @Transactional
    public AuthResponse login(final LoginRequest request) {
        final String email = normalizeEmail(request.getEmail());
        final User user = userRepository.findByEmailIgnoreCase(email)
                .orElseThrow(() -> new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE));

        if (user.getStatus() != RowStatus.ACTIVE) {
            throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
        }
        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
        }

        user.setLastLoginAt(LocalDateTime.now());
        userRepository.save(user);

        return buildAuthResponse(user);
    }

    public AuthenticatedUserDTO getCurrentUser(final User user) {
        return toAuthenticatedUserDTO(user);
    }

    @Transactional
    public void changePassword(final User user, final ChangePasswordRequest request) {
        if (!passwordEncoder.matches(request.getCurrentPassword(), user.getPasswordHash())) {
            throw new UnauthorizedException("Current password is incorrect");
        }
        if (passwordEncoder.matches(request.getNewPassword(), user.getPasswordHash())) {
            throw new BadRequestException("New password must be different from the current password");
        }
        PasswordPolicy.validate(request.getNewPassword());

        user.setPasswordHash(passwordEncoder.encode(request.getNewPassword()));
        userRepository.save(user);
    }

    @Transactional
    public MessageResponse requestPasswordReset(final PasswordResetRequest request) {
        final String email = normalizeEmail(request.getEmail());
        userRepository.findByEmailIgnoreCase(email)
                .filter(user -> user.getStatus() == RowStatus.ACTIVE)
                .ifPresent(this::issuePasswordResetToken);

        // Always the same response, whether or not the account exists, to prevent account enumeration.
        return new MessageResponse(GENERIC_RESET_REQUESTED_MESSAGE);
    }

    private void issuePasswordResetToken(final User user) {
        passwordResetTokenRepository.findAllByUserIdAndUsedFalseAndRevokedFalse(user.getId())
                .forEach(token -> token.setRevoked(true));

        final String rawToken = generateRawToken();
        final PasswordResetToken token = new PasswordResetToken();
        token.setUser(user);
        token.setTokenHash(hashToken(rawToken));
        token.setExpiresAt(OffsetDateTime.now().plusMinutes(resetTokenExpirationMinutes));
        passwordResetTokenRepository.save(token);

        passwordResetNotifier.sendResetToken(user, rawToken);
    }

    @Transactional
    public void completePasswordReset(final PasswordResetCompleteRequest request) {
        final PasswordResetToken token = passwordResetTokenRepository.findByTokenHash(hashToken(request.getToken()))
                .filter(PasswordResetToken::isValid)
                .orElseThrow(() -> new BadRequestException(INVALID_RESET_TOKEN_MESSAGE));

        PasswordPolicy.validate(request.getNewPassword());

        final User user = token.getUser();
        user.setPasswordHash(passwordEncoder.encode(request.getNewPassword()));
        userRepository.save(user);

        token.setUsed(true);
        passwordResetTokenRepository.findAllByUserIdAndUsedFalseAndRevokedFalse(user.getId())
                .forEach(other -> other.setRevoked(true));
    }

    private AuthResponse buildAuthResponse(final User user) {
        final String accessToken = jwtService.generateToken(user);
        return new AuthResponse(accessToken, jwtService.getExpirationSeconds(), toAuthenticatedUserDTO(user));
    }

    private AuthenticatedUserDTO toAuthenticatedUserDTO(final User user) {
        final AuthenticatedUserDTO dto = new AuthenticatedUserDTO();
        dto.setId(user.getId());
        dto.setName(user.getName());
        dto.setEmail(user.getEmail());
        dto.setRole(user.getRole());
        dto.setStatus(user.getStatus());
        dto.setStoreId(user.getStore() == null ? null : user.getStore().getId());
        return dto;
    }

    private String normalizeEmail(final String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    private String generateRawToken() {
        final byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String hashToken(final String rawToken) {
        try {
            final MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(rawToken.getBytes(StandardCharsets.UTF_8)));
        } catch (final NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is not available", e);
        }
    }

}
