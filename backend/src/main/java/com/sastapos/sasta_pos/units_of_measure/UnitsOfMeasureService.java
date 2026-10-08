package com.sastapos.sasta_pos.units_of_measure;

import com.sastapos.sasta_pos.product.dto.PageResponse;
import com.sastapos.sasta_pos.units_of_measure.dto.UnitsOfMeasureDTO;
import com.sastapos.sasta_pos.util.BadRequestException;
import jakarta.persistence.criteria.Predicate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
@RequiredArgsConstructor
public class UnitsOfMeasureService {

    static final int MAX_PAGE_SIZE = 100;
    private static final Map<String, String> SORTABLE_FIELDS = Map.of(
            "name", "name",
            "code", "code",
            "allowsFraction", "allowsFraction",
            "isActive", "isActive",
            "dateCreated", "dateCreated",
            "lastUpdated", "lastUpdated");

    private final UnitsOfMeasureRepository unitsOfMeasureRepository;

    public record UnitsOfMeasureFilter(String search, String name, String code, Boolean isActive,
            Boolean allowsFraction, OffsetDateTime createdFrom, OffsetDateTime createdTo,
            OffsetDateTime updatedFrom, OffsetDateTime updatedTo) {
    }

    @Transactional(readOnly = true)
    public PageResponse<UnitsOfMeasureDTO> findAll(final UnitsOfMeasureFilter filter, final int page,
            final int size, final String sortBy, final String sortDir) {
        validateRange("createdFrom", filter.createdFrom(), "createdTo", filter.createdTo());
        validateRange("updatedFrom", filter.updatedFrom(), "updatedTo", filter.updatedTo());
        if (page < 0) {
            throw new BadRequestException("page must be >= 0");
        }
        if (size < 1) {
            throw new BadRequestException("size must be >= 1");
        }
        final String sortField = SORTABLE_FIELDS.get(sortBy);
        if (sortField == null) {
            throw new BadRequestException("sortBy must be one of " + SORTABLE_FIELDS.keySet().stream().sorted().toList());
        }
        final Sort.Direction direction = switch (sortDir.toLowerCase(Locale.ROOT)) {
            case "asc" -> Sort.Direction.ASC;
            case "desc" -> Sort.Direction.DESC;
            default -> throw new BadRequestException("sortDir must be 'asc' or 'desc'");
        };

        final PageRequest pageable = PageRequest.of(page, Math.min(size, MAX_PAGE_SIZE),
                Sort.by(direction, sortField).and(Sort.by("id")));
        return PageResponse.of(unitsOfMeasureRepository.findAll(buildSpecification(filter), pageable)
                .map(this::mapToDTO));
    }

    private Specification<UnitsOfMeasure> buildSpecification(final UnitsOfMeasureFilter filter) {
        return (root, query, cb) -> {
            final List<Predicate> predicates = new ArrayList<>();
            if (StringUtils.hasText(filter.search())) {
                final String pattern = "%" + escapeLike(filter.search().trim().toLowerCase(Locale.ROOT)) + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("name")), pattern, '\\'),
                        cb.like(cb.lower(root.get("code")), pattern, '\\')));
            }
            if (StringUtils.hasText(filter.name())) {
                predicates.add(cb.like(cb.lower(root.get("name")),
                        "%" + escapeLike(filter.name().trim().toLowerCase(Locale.ROOT)) + "%", '\\'));
            }
            if (StringUtils.hasText(filter.code())) {
                predicates.add(cb.like(cb.lower(root.get("code")),
                        "%" + escapeLike(filter.code().trim().toLowerCase(Locale.ROOT)) + "%", '\\'));
            }
            if (filter.isActive() != null) {
                predicates.add(cb.equal(root.get("isActive"), filter.isActive()));
            }
            if (filter.allowsFraction() != null) {
                predicates.add(cb.equal(root.get("allowsFraction"), filter.allowsFraction()));
            }
            if (filter.createdFrom() != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("dateCreated"), filter.createdFrom()));
            }
            if (filter.createdTo() != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("dateCreated"), filter.createdTo()));
            }
            if (filter.updatedFrom() != null) {
                predicates.add(cb.greaterThanOrEqualTo(root.get("lastUpdated"), filter.updatedFrom()));
            }
            if (filter.updatedTo() != null) {
                predicates.add(cb.lessThanOrEqualTo(root.get("lastUpdated"), filter.updatedTo()));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
    }

    private static String escapeLike(final String value) {
        return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }

    private static void validateRange(final String fromName, final OffsetDateTime from, final String toName,
            final OffsetDateTime to) {
        if (from != null && to != null && from.isAfter(to)) {
            throw new BadRequestException(fromName + " must be <= " + toName);
        }
    }

    private UnitsOfMeasureDTO mapToDTO(final UnitsOfMeasure unit) {
        final UnitsOfMeasureDTO dto = new UnitsOfMeasureDTO();
        dto.setId(unit.getId());
        dto.setName(unit.getName());
        dto.setCode(unit.getCode());
        dto.setAllowsFraction(unit.getAllowsFraction());
        dto.setIsActive(unit.getIsActive());
        dto.setDateCreated(unit.getDateCreated());
        dto.setLastUpdated(unit.getLastUpdated());
        return dto;
    }

}
