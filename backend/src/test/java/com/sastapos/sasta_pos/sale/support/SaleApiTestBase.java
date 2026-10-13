package com.sastapos.sasta_pos.sale.support;

import static org.assertj.core.api.Assertions.assertThat;

import com.jayway.jsonpath.JsonPath;
import com.sastapos.sasta_pos.customer.Customer;
import com.sastapos.sasta_pos.customer.CustomerRepository;
import com.sastapos.sasta_pos.product.support.ProductApiTestBase;
import java.math.BigDecimal;
import java.sql.Statement;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;

public abstract class SaleApiTestBase extends ProductApiTestBase {

    protected static final String SALES_URL = "/api/sales";

    @Autowired
    protected CustomerRepository customerRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    /** Fixture-only rewrite of a posted sale's date; bypasses the V7 immutability trigger. */
    protected void backdateSale(final UUID id, final int days) {
        jdbcTemplate.execute((ConnectionCallback<Void>) connection -> {
            final boolean autoCommit = connection.getAutoCommit();
            connection.setAutoCommit(false);
            try (Statement statement = connection.createStatement()) {
                statement.execute("SET LOCAL session_replication_role = replica");
                statement.executeUpdate("UPDATE sales SET sold_at = sold_at - interval '" + days
                        + " days' WHERE id = '" + id + "'");
                connection.commit();
            } finally {
                connection.setAutoCommit(autoCommit);
            }
            return null;
        });
    }

    protected ResponseEntity<String> putJson(final String url, final String body, final String token) {
        final HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(token);
        return restTemplate.exchange(url, HttpMethod.PUT, new HttpEntity<>(body, headers), String.class);
    }

    protected static String saleUrl(final UUID id) {
        return SALES_URL + "/" + id;
    }

    protected static String voidUrl(final UUID id) {
        return SALES_URL + "/" + id + "/void";
    }

    protected static String item(final UUID productId, final String qty, final String itemTotal) {
        return "{\"productId\":\"%s\",\"quantity\":%s,\"itemTotal\":%s}".formatted(productId, qty, itemTotal);
    }

    protected static String payment(final String amount, final String method) {
        return "{\"amount\":%s,\"method\":\"%s\"}".formatted(amount, method);
    }

    /** Builds a create-sale body; null customer/discount are omitted. */
    protected static String saleJson(final String type, final UUID customerId, final String discount,
            final String status, final String totalItems, final String totalPrice, final String totalPaid,
            final String items, final String payments) {
        final StringBuilder sb = new StringBuilder("{\"saleType\":\"" + type + "\"");
        if (customerId != null) {
            sb.append(",\"customerId\":\"").append(customerId).append("\"");
        }
        if (discount != null) {
            sb.append(",\"discount\":").append(discount);
        }
        if (status != null) {
            sb.append(",\"saleStatus\":\"").append(status).append("\"");
        }
        sb.append(",\"totalItems\":").append(totalItems);
        sb.append(",\"totalPrice\":").append(totalPrice);
        sb.append(",\"totalPaidPrice\":").append(totalPaid);
        sb.append(",\"saleItems\":[").append(items).append("]");
        sb.append(",\"payments\":[").append(payments).append("]}");
        return sb.toString();
    }

    /** DEBIT sale of 2 x 5.00 product (total 10.00) paid in cash. */
    protected static String simpleDebit(final UUID productId) {
        return saleJson("DEBIT", null, null, null, "1", "10.00", "10.00", item(productId, "2", "10.00"),
                payment("10.00", "CASH"));
    }

    protected UUID newCustomer(final String token) {
        final ResponseEntity<String> r = postJson("/api/customers",
                "{\"name\":\"Cust " + UUID.randomUUID().toString().substring(0, 8) + "\"}", token);
        assertThat(r.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        return UUID.fromString(JsonPath.read(r.getBody(), "$.id"));
    }

    protected Customer customer(final UUID id) {
        return customerRepository.findById(id).orElseThrow();
    }

    protected BigDecimal balanceOf(final UUID customerId) {
        return customer(customerId).getAccountBalance();
    }

    protected UUID createSale(final String token, final String body) {
        final ResponseEntity<String> r = postJson(SALES_URL, body, token);
        assertThat(r.getStatusCode()).as(r.getBody()).isEqualTo(HttpStatus.CREATED);
        return UUID.fromString(JsonPath.read(r.getBody(), "$.id"));
    }

    protected BigDecimal stockOf(final UUID productId) {
        return productRepository.findById(productId).orElseThrow().getStockQuantity();
    }
}
