package com.sastapos.sasta_pos.auth;

import com.sastapos.sasta_pos.auth.dto.AuthResponse;
import com.sastapos.sasta_pos.auth.dto.AuthenticatedUserDTO;
import com.sastapos.sasta_pos.auth.dto.ChangePasswordRequest;
import com.sastapos.sasta_pos.auth.dto.LoginRequest;
import com.sastapos.sasta_pos.auth.dto.MessageResponse;
import com.sastapos.sasta_pos.auth.dto.PasswordResetCompleteRequest;
import com.sastapos.sasta_pos.auth.dto.PasswordResetRequest;
import com.sastapos.sasta_pos.auth.dto.SignupRequest;
import com.sastapos.sasta_pos.user.User;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;


@RestController
@RequestMapping(value = "/api/auth", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "Auth", description = "Signup, login and account/session management")
@RequiredArgsConstructor
public class AuthResource {

    private final AuthService authService;

    @PostMapping("/signup")
    @ApiResponse(responseCode = "201")
    @Operation(summary = "Create a new CASHIER account and issue an access token")
    public ResponseEntity<AuthResponse> signup(@RequestBody @Valid final SignupRequest request) {
        return new ResponseEntity<>(authService.signup(request), HttpStatus.CREATED);
    }

    @PostMapping("/login")
    @Operation(summary = "Authenticate with email/password and issue an access token")
    public ResponseEntity<AuthResponse> login(@RequestBody @Valid final LoginRequest request) {
        return ResponseEntity.ok(authService.login(request));
    }

    @GetMapping("/me")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Get the currently authenticated user's profile")
    public ResponseEntity<AuthenticatedUserDTO> me(@AuthenticationPrincipal final User user) {
        return ResponseEntity.ok(authService.getCurrentUser(user));
    }

    @PostMapping("/logout")
    @ApiResponse(responseCode = "204")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Log out the current session (client discards the access token)")
    public ResponseEntity<Void> logout() {
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/change-password")
    @ApiResponse(responseCode = "204")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Change the current user's password")
    public ResponseEntity<Void> changePassword(@AuthenticationPrincipal final User user,
            @RequestBody @Valid final ChangePasswordRequest request) {
        authService.changePassword(user, request);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/password-reset/request")
    @ApiResponse(responseCode = "202")
    @Operation(summary = "Request a password reset link/token for an email address")
    public ResponseEntity<MessageResponse> requestPasswordReset(
            @RequestBody @Valid final PasswordResetRequest request) {
        return new ResponseEntity<>(authService.requestPasswordReset(request), HttpStatus.ACCEPTED);
    }

    @PostMapping("/password-reset/complete")
    @ApiResponse(responseCode = "204")
    @Operation(summary = "Complete a password reset using the token that was sent out of band")
    public ResponseEntity<Void> completePasswordReset(
            @RequestBody @Valid final PasswordResetCompleteRequest request) {
        authService.completePasswordReset(request);
        return ResponseEntity.noContent().build();
    }

}
