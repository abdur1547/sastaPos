import { safeReturnUrl } from "./return-navigation";

describe("safeReturnUrl", () => {
  it("accepts in-app absolute paths", () => {
    expect(safeReturnUrl("/sell")).toBe("/sell");
  });

  it.each([
    null,
    undefined,
    "",
    "sell",
    "//evil.com",
    "https://evil.com",
    "/\\evil.com",
  ])("rejects %p", (value) => {
    expect(safeReturnUrl(value)).toBeNull();
  });
});
