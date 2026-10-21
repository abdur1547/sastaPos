package com.sastapos.sasta_pos.pos_info;

import com.sastapos.sasta_pos.pos_info.dto.PosInfoDTO;
import com.sastapos.sasta_pos.util.NotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class PosInfoService {

    private final PosInfoRepository posInfoRepository;

    @Transactional(readOnly = true)
    public PosInfoDTO get() {
        final PosInfo posInfo = posInfoRepository.findFirstByOrderByDateCreatedAsc()
                .orElseThrow(() -> new NotFoundException("POS info not found"));
        return mapToDTO(posInfo);
    }

    private PosInfoDTO mapToDTO(final PosInfo posInfo) {
        final PosInfoDTO dto = new PosInfoDTO();
        dto.setId(posInfo.getId());
        dto.setPosId(posInfo.getPosId());
        dto.setPosName(posInfo.getPosName());
        dto.setRegistrationNumber(posInfo.getRegistrationNumber());
        dto.setSoftwareName(posInfo.getSoftwareName());
        dto.setSoftwareVersion(posInfo.getSoftwareVersion());
        dto.setVendorName(posInfo.getVendorName());
        dto.setVendorNtn(posInfo.getVendorNtn());
        dto.setIsActive(posInfo.getIsActive());
        dto.setDateCreated(posInfo.getDateCreated());
        dto.setLastUpdated(posInfo.getLastUpdated());
        return dto;
    }

}
