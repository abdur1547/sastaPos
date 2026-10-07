package com.sastapos.sasta_pos.user;

import com.sastapos.sasta_pos.user.dto.CreateUserRequestDTO;
import com.sastapos.sasta_pos.user.dto.UpdateUserRequestDTO;
import com.sastapos.sasta_pos.user.dto.UserDTO;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;


@RestController
@RequiredArgsConstructor
@RequestMapping(value = "/api/users", produces = MediaType.APPLICATION_JSON_VALUE)
public class UserResource {

    private final UserService userService;

    @GetMapping
    public ResponseEntity<List<UserDTO>> getAllUsers(@AuthenticationPrincipal final User currentUser) {
        return ResponseEntity.ok(userService.findAll(currentUser));
    }

    @GetMapping("/{id}")
    public ResponseEntity<UserDTO> getUser(@AuthenticationPrincipal final User currentUser,
            @PathVariable(name = "id") final UUID id) {
        return ResponseEntity.ok(userService.get(currentUser, id));
    }

    @PostMapping
    @ApiResponse(responseCode = "201")
    public ResponseEntity<UUID> createUser(@AuthenticationPrincipal final User currentUser,
                                           @RequestBody @Valid final CreateUserRequestDTO createUserRequestDTO) {
        final UUID createdId = userService.create(currentUser, createUserRequestDTO);
        return new ResponseEntity<>(createdId, HttpStatus.CREATED);
    }

    @PutMapping("/{id}")
    public ResponseEntity<UUID> updateUser(@AuthenticationPrincipal final User currentUser,
            @PathVariable(name = "id") final UUID id,
            @RequestBody @Valid final UpdateUserRequestDTO updateUserRequestDTO) {
        userService.update(currentUser, id, updateUserRequestDTO);
        return ResponseEntity.ok(id);
    }

    @DeleteMapping("/{id}")
    @ApiResponse(responseCode = "204")
    public ResponseEntity<Void> deleteUser(@AuthenticationPrincipal final User currentUser, @PathVariable(name = "id") final UUID id) {
        userService.delete(currentUser, id);
        return ResponseEntity.noContent().build();
    }

}
