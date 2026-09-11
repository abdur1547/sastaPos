package com.sastapos.sasta_pos.business_setting;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;


public interface BusinessSettingRepository extends JpaRepository<BusinessSetting, UUID> {
}
