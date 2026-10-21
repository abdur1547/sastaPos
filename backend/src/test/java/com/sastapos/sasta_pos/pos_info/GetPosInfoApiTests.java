package com.sastapos.sasta_pos.pos_info;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.sastapos.sasta_pos.auth.support.TestDataFactory;
import com.sastapos.sasta_pos.store.support.StoreApiTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

class GetPosInfoApiTests extends StoreApiTestBase {

    private static final String URL = "/api/pos-info";

    @Autowired
    private PosInfoRepository posInfoRepository;

    private String token() {
        return signupAndGetToken(TestDataFactory.personName(), TestDataFactory.uniqueEmail(),
                TestDataFactory.validPassword());
    }

    @Test
    void shouldRejectUnauthenticatedRequests() {
        final ResponseEntity<String> response = restTemplate.getForEntity(URL, String.class);

        assertThat(response.getStatusCode()).isIn(HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN);
    }

    @Test
    void shouldReturnPosInfoToAnyAuthenticatedUser() {
        posInfoRepository.deleteAll();
        final PosInfo posInfo = new PosInfo();
        posInfo.setIsActive(true);
        posInfo.setPosId("05");
        posInfo.setVendorNtn("1234567");
        posInfoRepository.saveAndFlush(posInfo);

        final ResponseEntity<String> response = getJson(URL, token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(JsonPath.<String>read(response.getBody(), "$.posId")).isEqualTo("05");
        assertThat(JsonPath.<String>read(response.getBody(), "$.vendorNtn")).isEqualTo("1234567");
        assertThat(JsonPath.<Boolean>read(response.getBody(), "$.isActive")).isTrue();
    }

    @Test
    void shouldReturnNotFoundWhenNoPosInfoExists() {
        posInfoRepository.deleteAll();

        final ResponseEntity<String> response = getJson(URL, token());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

}
