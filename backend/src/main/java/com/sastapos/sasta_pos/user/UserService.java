package com.sastapos.sasta_pos.user;

import com.sastapos.sasta_pos.events.BeforeDeleteStore;
import com.sastapos.sasta_pos.events.BeforeDeleteUser;
import com.sastapos.sasta_pos.store.RowStatus;
import com.sastapos.sasta_pos.auth.PasswordPolicy;
import com.sastapos.sasta_pos.auth.PasswordResetTokenRepository;
import com.sastapos.sasta_pos.store.StoreRepository;
import com.sastapos.sasta_pos.util.ConflictException;
import com.sastapos.sasta_pos.util.ForbiddenException;
import java.util.Locale;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import com.sastapos.sasta_pos.user.dto.CreateUserRequestDTO;
import com.sastapos.sasta_pos.user.dto.UpdateUserRequestDTO;
import com.sastapos.sasta_pos.user.dto.UserDTO;
import com.sastapos.sasta_pos.util.NotFoundException;
import com.sastapos.sasta_pos.util.ReferencedException;
import java.util.List;
import java.util.UUID;

import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;


@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepository;
    private final StoreRepository storeRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final ApplicationEventPublisher publisher;

    @Transactional(readOnly = true)
    public List<UserDTO> findAll(final User currentUser) {
        final UUID storeId = requireOwnedStoreId(currentUser);
        return userRepository.findAllByStoreId(storeId, Sort.by("id")).stream()
                .map(user -> mapToDTO(user, new UserDTO()))
                .toList();
    }

    @Transactional(readOnly = true)
    public UserDTO get(final User currentUser, final UUID id) {
        return mapToDTO(requireStoreUser(currentUser, id), new UserDTO());
    }

    @Transactional
    public UUID create(final User currentUser, final CreateUserRequestDTO createUserRequestDTO) {
        final UUID storeId = requireOwnedStoreId(currentUser);
        final String email = normalizeEmail(createUserRequestDTO.getEmail());
        if (userRepository.existsByEmailIgnoreCase(email)) {
            throw new ConflictException("An account with this email already exists");
        }
        PasswordPolicy.validate(createUserRequestDTO.getPassword());

        final User user = new User();
        user.setName(createUserRequestDTO.getName());
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(createUserRequestDTO.getPassword()));
        user.setRole(UserRole.CASHIER);
        user.setStatus(RowStatus.ACTIVE);
        user.setStore(storeRepository.getReferenceById(storeId));
        return userRepository.save(user).getId();
    }

    @Transactional
    public void update(final User currentUser, final UUID id, final UpdateUserRequestDTO updateUserRequestDTO) {
        final User user = requireStoreUser(currentUser, id);
        final String email = normalizeEmail(updateUserRequestDTO.getEmail());
        if (userRepository.existsByEmailIgnoreCaseAndIdNot(email, id)) {
            throw new ConflictException("An account with this email already exists");
        }
        user.setName(updateUserRequestDTO.getName());
        user.setEmail(email);
        userRepository.save(user);
    }

    @Transactional
    public void delete(final User currentUser, final UUID id) {
        final User user = requireStoreUser(currentUser, id);
        if (user.getId().equals(currentUser.getId())) {
            throw new ConflictException("You cannot delete your own account");
        }
        publisher.publishEvent(new BeforeDeleteUser(id));
        passwordResetTokenRepository.deleteAll(passwordResetTokenRepository.findAllByUserId(id));
        userRepository.delete(user);
    }

    /** Only the owner of a store may manage users, and only users belonging to that same store. */
    private UUID requireOwnedStoreId(final User currentUser) {
        if (currentUser.getRole() != UserRole.OWNER || currentUser.getStore() == null) {
            throw new ForbiddenException("Only the store owner can perform this action");
        }
        return currentUser.getStore().getId();
    }

    private User requireStoreUser(final User currentUser, final UUID id) {
        final UUID storeId = requireOwnedStoreId(currentUser);
        return userRepository.findByIdAndStoreId(id, storeId).orElseThrow(NotFoundException::new);
    }

    private String normalizeEmail(final String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    private UserDTO mapToDTO(final User user, final UserDTO userDTO) {
        userDTO.setId(user.getId());
        userDTO.setName(user.getName());
        userDTO.setEmail(user.getEmail());
        userDTO.setRole(user.getRole());
        userDTO.setStatus(user.getStatus());
        userDTO.setLastLoginAt(user.getLastLoginAt());
        userDTO.setStore(user.getStore() == null ? null : user.getStore().getId());
        return userDTO;
    }

    @EventListener(BeforeDeleteStore.class)
    public void on(final BeforeDeleteStore event) {
        final ReferencedException referencedException = new ReferencedException();
        final User storeUser = userRepository.findFirstByStoreId(event.getId());
        if (storeUser != null) {
            referencedException.setKey("store.user.store.referenced");
            referencedException.addParam(storeUser.getId());
            throw referencedException;
        }
    }

}
