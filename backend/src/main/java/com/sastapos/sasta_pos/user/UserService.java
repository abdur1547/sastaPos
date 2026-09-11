package com.sastapos.sasta_pos.user;

import com.sastapos.sasta_pos.events.BeforeDeleteStore;
import com.sastapos.sasta_pos.events.BeforeDeleteUser;
import com.sastapos.sasta_pos.store.Store;
import com.sastapos.sasta_pos.store.StoreRepository;
import com.sastapos.sasta_pos.util.NotFoundException;
import com.sastapos.sasta_pos.util.ReferencedException;
import java.util.List;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;


@Service
public class UserService {

    private final UserRepository userRepository;
    private final StoreRepository storeRepository;
    private final ApplicationEventPublisher publisher;

    public UserService(final UserRepository userRepository, final StoreRepository storeRepository,
            final ApplicationEventPublisher publisher) {
        this.userRepository = userRepository;
        this.storeRepository = storeRepository;
        this.publisher = publisher;
    }

    public List<UserDTO> findAll() {
        final List<User> users = userRepository.findAll(Sort.by("id"));
        return users.stream()
                .map(user -> mapToDTO(user, new UserDTO()))
                .toList();
    }

    public UserDTO get(final UUID id) {
        return userRepository.findById(id)
                .map(user -> mapToDTO(user, new UserDTO()))
                .orElseThrow(NotFoundException::new);
    }

    public UUID create(final UserDTO userDTO) {
        final User user = new User();
        mapToEntity(userDTO, user);
        return userRepository.save(user).getId();
    }

    public void update(final UUID id, final UserDTO userDTO) {
        final User user = userRepository.findById(id)
                .orElseThrow(NotFoundException::new);
        mapToEntity(userDTO, user);
        userRepository.save(user);
    }

    public void delete(final UUID id) {
        final User user = userRepository.findById(id)
                .orElseThrow(NotFoundException::new);
        publisher.publishEvent(new BeforeDeleteUser(id));
        userRepository.delete(user);
    }

    private UserDTO mapToDTO(final User user, final UserDTO userDTO) {
        userDTO.setId(user.getId());
        userDTO.setName(user.getName());
        userDTO.setUserName(user.getUserName());
        userDTO.setPasswordHash(user.getPasswordHash());
        userDTO.setRole(user.getRole());
        userDTO.setStatus(user.getStatus());
        userDTO.setLastLoginAt(user.getLastLoginAt());
        userDTO.setStore(user.getStore() == null ? null : user.getStore().getId());
        return userDTO;
    }

    private User mapToEntity(final UserDTO userDTO, final User user) {
        user.setName(userDTO.getName());
        user.setUserName(userDTO.getUserName());
        user.setPasswordHash(userDTO.getPasswordHash());
        user.setRole(userDTO.getRole());
        user.setStatus(userDTO.getStatus());
        user.setLastLoginAt(userDTO.getLastLoginAt());
        final Store store = userDTO.getStore() == null ? null : storeRepository.findById(userDTO.getStore())
                .orElseThrow(() -> new NotFoundException("store not found"));
        user.setStore(store);
        return user;
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
