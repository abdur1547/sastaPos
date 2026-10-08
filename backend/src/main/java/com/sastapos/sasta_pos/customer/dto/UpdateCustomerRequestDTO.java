package com.sastapos.sasta_pos.customer.dto;

import com.sastapos.sasta_pos.product.dto.StrictRequestDTO;
import com.sastapos.sasta_pos.store.RowStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;


/** Partial update: omitted/null fields are unchanged. accountBalance is not editable and unknown properties are rejected. */
@Getter
@Setter
@Schema(description = "Partial customer update. Omitted fields are unchanged; accountBalance cannot be edited.")
public class UpdateCustomerRequestDTO extends StrictRequestDTO {

    @Size(max = 255)
    @Pattern(regexp = ".*\\S.*", message = "must not be blank")
    @Schema(description = "New name, unique (case-insensitive) within the store")
    private String name;

    @Size(max = 50)
    @Schema(description = "New phone number, unique across all stores. A blank value clears it.")
    private String phoneNumber;

    @Size(max = 255)
    @Schema(description = "New NTN. A blank value clears it.")
    private String ntn;

    @Schema(description = "ACTIVE reactivates the customer; INACTIVE hides it (balance is left untouched)")
    private RowStatus status;

}
