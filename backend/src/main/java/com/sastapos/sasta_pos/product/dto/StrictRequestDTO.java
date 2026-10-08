package com.sastapos.sasta_pos.product.dto;

import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.validation.constraints.AssertTrue;
import java.util.LinkedHashSet;
import java.util.Set;


/**
 * The app-wide ObjectMapper ignores unknown JSON properties; request bodies extending this class
 * collect them instead and fail bean validation (400), so typos or forbidden fields such as
 * {@code stockQuantity} on update never get silently dropped.
 */
public abstract class StrictRequestDTO {

    @JsonIgnore
    private final Set<String> unknownProperties = new LinkedHashSet<>();

    @JsonAnySetter
    void collectUnknownProperty(final String name, final Object ignoredValue) {
        unknownProperties.add(name);
    }

    @JsonIgnore
    @AssertTrue(message = "request contains unknown or non-editable properties")
    public boolean isNoUnknownProperties() {
        return unknownProperties.isEmpty();
    }

}
