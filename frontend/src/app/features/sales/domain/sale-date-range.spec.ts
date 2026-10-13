import { parseSqlTimestamp, resolveSoldAtRange, toSqliteUtc } from "./sale-date-range";

describe("sale date range", () => {
  const now = new Date(2026, 4, 10, 15, 30);

  it("resolves today as the local calendar day in UTC bounds", () => {
    expect(resolveSoldAtRange("today", "", "", now)).toEqual({
      from: toSqliteUtc(new Date(2026, 4, 10)),
      to: toSqliteUtc(new Date(2026, 4, 11)),
    });
  });

  it("covers the previous calendar month", () => {
    expect(resolveSoldAtRange("lastMonth", "", "", now)).toEqual({
      from: toSqliteUtc(new Date(2026, 3, 1)),
      to: toSqliteUtc(new Date(2026, 4, 1)),
    });
  });

  it("makes a custom range inclusive and tolerates swapped dates", () => {
    expect(resolveSoldAtRange("custom", "2026-05-08", "2026-05-01", now)).toEqual({
      from: toSqliteUtc(new Date(2026, 4, 1)),
      to: toSqliteUtc(new Date(2026, 4, 9)),
    });
  });

  it("is unbounded for all time", () => {
    expect(resolveSoldAtRange("all", "", "", now)).toEqual({ from: null, to: null });
  });

  it("reads synced zone-less timestamps as UTC and local ISO writes as-is", () => {
    expect(parseSqlTimestamp("2026-05-10 08:00:00")?.toISOString()).toBe("2026-05-10T08:00:00.000Z");
    expect(parseSqlTimestamp("2026-05-10T08:00:00.000Z")?.toISOString()).toBe("2026-05-10T08:00:00.000Z");
    expect(parseSqlTimestamp("not a date")).toBeNull();
  });
});
