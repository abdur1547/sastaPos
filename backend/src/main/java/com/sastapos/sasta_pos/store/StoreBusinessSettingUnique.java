package com.sastapos.sasta_pos.store;

import static java.lang.annotation.ElementType.ANNOTATION_TYPE;
import static java.lang.annotation.ElementType.FIELD;
import static java.lang.annotation.ElementType.METHOD;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;
import java.lang.annotation.Documented;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import java.util.Map;
import java.util.UUID;
import org.springframework.web.servlet.HandlerMapping;


/**
 * Validate that the businessSetting value isn't taken yet.
 */
@Target({ FIELD, METHOD, ANNOTATION_TYPE })
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Constraint(
        validatedBy = StoreBusinessSettingUnique.StoreBusinessSettingUniqueValidator.class
)
public @interface StoreBusinessSettingUnique {

    String message() default "{Exists.store.businessSetting}";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};

    class StoreBusinessSettingUniqueValidator implements ConstraintValidator<StoreBusinessSettingUnique, UUID> {

        private final StoreService storeService;
        private final HttpServletRequest request;

        public StoreBusinessSettingUniqueValidator(final StoreService storeService,
                final HttpServletRequest request) {
            this.storeService = storeService;
            this.request = request;
        }

        @Override
        public boolean isValid(final UUID value, final ConstraintValidatorContext cvContext) {
            if (value == null) {
                // no value present
                return true;
            }
            @SuppressWarnings("unchecked") final Map<String, String> pathVariables =
                    ((Map<String, String>)request.getAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE));
            final String currentId = pathVariables.get("id");
            if (currentId != null && value.equals(storeService.get(UUID.fromString(currentId)).getBusinessSetting())) {
                // value hasn't changed
                return true;
            }
            return !storeService.businessSettingExists(value);
        }

    }

}
