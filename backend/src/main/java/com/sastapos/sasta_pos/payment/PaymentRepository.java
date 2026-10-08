package com.sastapos.sasta_pos.payment;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;


public interface PaymentRepository extends JpaRepository<Payment, UUID> {
}
