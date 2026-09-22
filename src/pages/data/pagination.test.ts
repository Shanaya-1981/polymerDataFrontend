import { describe, expect, it } from "vitest";
import { DEFAULT_PAGE_SIZE, isValidPageSize, PAGE_SIZE_OPTIONS, paginate } from "./pagination";

describe("paginate", () => {
  it("computes the first page of a typical result set", () => {
    expect(paginate(655, 1, 25)).toEqual({
      page: 1,
      totalPages: 27,
      startIndex: 0,
      endIndex: 25,
      startDisplay: 1,
      endDisplay: 25,
    });
  });

  it("computes a short last page (655 rows, page size 25 -> a 5-row last page)", () => {
    const info = paginate(655, 27, 25);
    expect(info.startIndex).toBe(650);
    expect(info.endIndex).toBe(655);
    expect(info.startDisplay).toBe(651);
    expect(info.endDisplay).toBe(655);
  });

  it("clamps a page number past the end down to the last page", () => {
    expect(paginate(655, 999, 25).page).toBe(27);
  });

  it("clamps a page number below 1 up to 1", () => {
    expect(paginate(655, 0, 25).page).toBe(1);
    expect(paginate(655, -5, 25).page).toBe(1);
  });

  it("treats a non-finite/garbled page as page 1", () => {
    expect(paginate(655, Number.NaN, 25).page).toBe(1);
  });

  it("reports exactly one page of zero rows for an empty result set", () => {
    expect(paginate(0, 1, 25)).toEqual({
      page: 1,
      totalPages: 1,
      startIndex: 0,
      endIndex: 0,
      startDisplay: 0,
      endDisplay: 0,
    });
  });

  it("handles a result set that fits in exactly one page", () => {
    const info = paginate(10, 1, 25);
    expect(info.totalPages).toBe(1);
    expect(info.endIndex).toBe(10);
    expect(info.endDisplay).toBe(10);
  });

  it("respects a different page size", () => {
    const info = paginate(655, 3, 100);
    expect(info.totalPages).toBe(7);
    expect(info.startIndex).toBe(200);
    expect(info.endIndex).toBe(300);
  });
});

describe("isValidPageSize", () => {
  it("accepts every documented page size", () => {
    for (const size of PAGE_SIZE_OPTIONS) {
      expect(isValidPageSize(size)).toBe(true);
    }
  });

  it("rejects anything else", () => {
    expect(isValidPageSize(10)).toBe(false);
    expect(isValidPageSize(0)).toBe(false);
    expect(isValidPageSize(DEFAULT_PAGE_SIZE + 1)).toBe(false);
  });
});
