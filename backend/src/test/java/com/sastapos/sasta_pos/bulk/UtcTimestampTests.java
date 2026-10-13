package com.sastapos.sasta_pos.bulk;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;

class UtcTimestampTests {

    private final BulkColumn column = BulkColumn.utcTimestamp("sold_at").required();

    @Test
    void normalizesOffsetsToUtcWithoutMovingAnEveningSaleIntoTomorrow() {
        final LocalDateTime expected = LocalDateTime.parse("2026-10-13T18:30:00");
        assertThat(column.coerce("2026-10-13T23:30:00+05:00")).isEqualTo(expected);
        assertThat(column.coerce("2026-10-13T18:30:00Z")).isEqualTo(expected);
        assertThat(column.coerce(OffsetDateTime.parse("2026-10-13T23:30:00+05:00"))).isEqualTo(expected);
        assertThat(BulkColumn.timestamp("last_updated").coerce("2026-10-13T23:30:00+05:00"))
                .isEqualTo(OffsetDateTime.parse("2026-10-13T23:30:00+05:00"));
    }

    @Test
    void rejectsMissingInvalidAndZonelessInstants() {
        assertThatThrownBy(() -> column.coerce(null)).isInstanceOf(BulkValidationException.class);
        assertThatThrownBy(() -> column.coerce("not a timestamp")).isInstanceOf(BulkValidationException.class);
        assertThatThrownBy(() -> column.coerce("2026-10-13T23:30:00"))
                .isInstanceOf(BulkValidationException.class);
    }

    @Test
    void bothInsertAndPatchUseTimestampRatherThanSessionDependentTimestamptzConversion() {
        final BulkTable table = BulkTable.storeScoped("sales", column);
        final BulkWriter writer = new BulkWriter(null);
        assertThat(writer.upsertSql(table)).contains("CAST(:sold_at AS timestamp)").doesNotContain("timestamptz");
        assertThat(writer.patchSql(table)).contains("CAST(:sold_at AS timestamp)").doesNotContain("timestamptz");
    }
}
