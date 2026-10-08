package com.sastapos.sasta_pos.product.support;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.sastapos.sasta_pos.sale.Sale;
import com.sastapos.sasta_pos.sale.SaleStatus;
import com.sastapos.sasta_pos.sale_item.SaleItem;
import com.sastapos.sasta_pos.store.support.StoreApiTestBase;
import com.sastapos.sasta_pos.tax_category.TaxCategory;
import com.sastapos.sasta_pos.units_of_measure.UnitsOfMeasure;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;
import net.datafaker.Faker;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;


/**
 * Base class for product end-to-end specs (use cases 4–4d). Users, stores and products are
 * created through the API; units of measure, tax categories and sales have no API yet, so those
 * are seeded through repositories.
 */
public abstract class ProductApiTestBase extends StoreApiTestBase {

    protected static final String PRODUCTS_URL = "/api/products";

    private static final Faker FAKER = new Faker();

    // ---------- Seed helpers (no API exists for these) ----------

    protected UnitsOfMeasure seedUnit(final boolean allowsFraction) {
        final UnitsOfMeasure unit = new UnitsOfMeasure();
        unit.setName("unit-" + UUID.randomUUID());
        unit.setCode("u" + UUID.randomUUID());
        unit.setAllowsFraction(allowsFraction);
        unit.setIsActive(true);
        return unitsOfMeasureRepository.save(unit);
    }

    protected UnitsOfMeasure seedInactiveUnit() {
        final UnitsOfMeasure unit = seedUnit(true);
        unit.setIsActive(false);
        return unitsOfMeasureRepository.save(unit);
    }

    protected TaxCategory seedTaxCategory(final double rate) {
        return seedTaxCategory(rate, true, null);
    }

    protected TaxCategory seedTaxCategory(final double rate, final boolean active, final UUID storeId) {
        final TaxCategory category = new TaxCategory();
        category.setName("tax-" + UUID.randomUUID());
        category.setCode("t" + UUID.randomUUID());
        category.setRate(rate);
        category.setCalculationType("PERCENTAGE");
        category.setIsExempt(false);
        category.setIsActive(active);
        if (storeId != null) {
            category.setStore(storeRepository.getReferenceById(storeId));
        }
        return taxCategoryRepository.save(category);
    }

    /** Persists a sale containing one item of the product, the state that blocks hard delete. */
    protected void recordSaleOf(final UUID storeId, final UUID productId, final SaleStatus status) {
        final Sale sale = new Sale();
        sale.setInvoiceNumber("TEST-" + UUID.randomUUID());
        sale.setSubtotal(new java.math.BigDecimal("100.00"));
        sale.setDiscountAmount(new java.math.BigDecimal("0.00"));
        sale.setTaxableAmount(new java.math.BigDecimal("100.00"));
        sale.setTaxAmount(new java.math.BigDecimal("0.00"));
        sale.setTotalAmount(new java.math.BigDecimal("100.00"));
        sale.setCurrencyCode("PKR");
        sale.setStatus(status);
        sale.setSoldAt(LocalDateTime.now());
        sale.setStore(storeRepository.getReferenceById(storeId));
        saleRepository.save(sale);

        final SaleItem item = new SaleItem();
        item.setProductName("sold");
        item.setSku("sold-sku");
        item.setQuantity(new java.math.BigDecimal("1.00"));
        item.setUnitPrice(new java.math.BigDecimal("100.00"));
        item.setTaxRate(java.math.BigDecimal.ZERO);
        item.setTaxableAmount(new java.math.BigDecimal("100.00"));
        item.setLineTotal(new java.math.BigDecimal("100.00"));
        item.setSale(sale);
        item.setProduct(productRepository.getReferenceById(productId));
        saleItemRepository.save(item);
    }

    // ---------- Request builders ----------

    protected static String uniqueSku() {
        return "SKU-" + UUID.randomUUID();
    }

    protected static String uniquePct() {
        return "PCT-" + UUID.randomUUID();
    }

    protected static String productName() {
        return FAKER.commerce().productName();
    }

    /** A valid create body; callers tweak by passing explicit JSON for edge cases. */
    protected static String productJson(final UUID unitId) {
        return """
                {"name": "%s", "pctCode": "%s", "unitPrice": 10.50, "unitOfMeasureId": "%s"}"""
                .formatted(productName(), uniquePct(), unitId);
    }

    protected static String productJson(final String name, final String sku, final String barCode,
            final String pctCode, final String unitPrice, final String stockQuantity,
            final UUID unitId, final String taxCategoryIdsJson) {
        final StringBuilder json = new StringBuilder("{");
        json.append("\"name\": \"").append(name).append("\"");
        if (sku != null) {
            json.append(", \"sku\": \"").append(sku).append("\"");
        }
        if (barCode != null) {
            json.append(", \"barCode\": \"").append(barCode).append("\"");
        }
        json.append(", \"pctCode\": \"").append(pctCode).append("\"");
        json.append(", \"unitPrice\": ").append(unitPrice);
        if (stockQuantity != null) {
            json.append(", \"stockQuantity\": ").append(stockQuantity);
        }
        json.append(", \"unitOfMeasureId\": \"").append(unitId).append("\"");
        if (taxCategoryIdsJson != null) {
            json.append(", \"taxCategoryIds\": ").append(taxCategoryIdsJson);
        }
        return json.append("}").toString();
    }

    protected static String stockMovementJson(final String type, final String quantity,
            final String description) {
        return """
                {"type": "%s", "quantity": %s, "description": "%s"}""".formatted(type, quantity, description);
    }

    // ---------- Flow helpers ----------

    protected UUID createProduct(final String token, final String body) {
        final ResponseEntity<String> response = postJson(PRODUCTS_URL, body, token);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        return UUID.fromString(JsonPath.read(response.getBody(), "$.id"));
    }

    protected UUID createProduct(final String token, final UUID unitId) {
        return createProduct(token, productJson(unitId));
    }

    protected UUID createProductWithStock(final String token, final UUID unitId, final String stock) {
        return createProduct(token, productJson(productName(), null, null, uniquePct(), "5.00", stock,
                unitId, null));
    }

    protected String stockUrl(final UUID productId) {
        return PRODUCTS_URL + "/" + productId + "/stock-movements";
    }

    // ---------- Assertion helpers ----------

    protected static void assertProductShape(final Map<String, Object> product) {
        assertThat(product.keySet()).containsExactlyInAnyOrder("id", "name", "sku", "barCode",
                "pctCode", "description", "unitPrice", "stockQuantity", "status", "unitOfMeasureId",
                "taxCategoryIds", "storeId", "createdAt", "lastUpdated");
    }

    protected static BigDecimal decimal(final String json, final String path) {
        return new BigDecimal(String.valueOf((Object) JsonPath.read(json, path)));
    }

    protected static void assertDecimal(final String json, final String path, final String expected) {
        assertThat(decimal(json, path)).isEqualByComparingTo(expected);
    }


}
