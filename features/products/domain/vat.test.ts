import { describe, expect, it } from "vitest";

import { splitVatInclusive, vatRateSchema } from "@/features/products/domain/vat";

describe("splitVatInclusive", () => {
  it("splits a 1% inclusive price into base and VAT", () => {
    // 130,00 ₺ egg pack: 130 / 1.01 = 128.712... → 128,71 + 1,29
    expect(splitVatInclusive(13000, 1)).toEqual({ netMinor: 12871, vatMinor: 129 });
  });

  it("splits 10% and 20% exactly when divisible", () => {
    expect(splitVatInclusive(11000, 10)).toEqual({ netMinor: 10000, vatMinor: 1000 });
    expect(splitVatInclusive(12000, 20)).toEqual({ netMinor: 10000, vatMinor: 2000 });
  });

  it("rounds the base half-up", () => {
    // 101 / 1.20 = 84.1666 → 84 ; 103 / 1.20 = 85.8333 → 86 ; 3 / 1.20 = 2.5 → 3
    expect(splitVatInclusive(101, 20).netMinor).toBe(84);
    expect(splitVatInclusive(103, 20).netMinor).toBe(86);
    expect(splitVatInclusive(3, 20).netMinor).toBe(3);
  });

  it("puts everything in the base at 0% and handles zero", () => {
    expect(splitVatInclusive(4500, 0)).toEqual({ netMinor: 4500, vatMinor: 0 });
    expect(splitVatInclusive(0, 1)).toEqual({ netMinor: 0, vatMinor: 0 });
  });

  it("always adds back to the gross amount", () => {
    for (const rate of [0, 1, 10, 20] as const) {
      for (let gross = 0; gross <= 5000; gross += 7) {
        const { netMinor, vatMinor } = splitVatInclusive(gross, rate);
        expect(netMinor + vatMinor).toBe(gross);
        expect(vatMinor).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("rejects non-integer or negative amounts", () => {
    expect(() => splitVatInclusive(10.5, 1)).toThrow(RangeError);
    expect(() => splitVatInclusive(-1, 1)).toThrow(RangeError);
  });
});

describe("vatRateSchema", () => {
  it("accepts the statutory rates, from numbers or strings", () => {
    expect(vatRateSchema.parse(1)).toBe(1);
    expect(vatRateSchema.parse("20")).toBe(20);
  });

  it("rejects anything else", () => {
    expect(vatRateSchema.safeParse(8).success).toBe(false);
    expect(vatRateSchema.safeParse(18).success).toBe(false);
    expect(vatRateSchema.safeParse("abc").success).toBe(false);
  });
});
