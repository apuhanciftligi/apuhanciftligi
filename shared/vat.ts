/**
 * KDV (VAT) rates and the split of a VAT-inclusive amount into base + VAT.
 *
 * Every price in the system is VAT-inclusive (what the customer pays). An
 * invoice line needs the base (matrah) and the VAT separately, and the two
 * must add back to the charged amount to the kuruş, so the VAT is the
 * remainder rather than an independently rounded figure.
 *
 * Rates are the three statutory KDV rates plus 0 (exempt), as whole percent.
 * Source for the catalog's rates: migration 20261119231438_urun_kdv_orani.
 */
import { z } from "zod";

export const VAT_RATES = [0, 1, 10, 20] as const;
export type VatRate = (typeof VAT_RATES)[number];

/** Rate a new product starts with: farm food is on the (I) list (%1). */
export const DEFAULT_VAT_RATE: VatRate = 1;

export const vatRateSchema = z.coerce
  .number()
  .refine((n): n is VatRate => (VAT_RATES as readonly number[]).includes(n), {
    message: "KDV oranı 0, 1, 10 veya 20 olmalı.",
  })
  .transform((n) => n as VatRate);

export interface VatSplit {
  /** Base amount (matrah) in kuruş. */
  readonly netMinor: number;
  /** VAT amount in kuruş. netMinor + vatMinor === the gross input. */
  readonly vatMinor: number;
}

/**
 * Split a VAT-inclusive amount (kuruş, non-negative integer) into base and
 * VAT. The base is rounded half-up to the kuruş; VAT takes the remainder so
 * nothing is lost or invented by rounding.
 */
export function splitVatInclusive(grossMinor: number, rate: VatRate): VatSplit {
  if (!Number.isSafeInteger(grossMinor) || grossMinor < 0) {
    throw new RangeError(`grossMinor must be a non-negative integer, got ${grossMinor}`);
  }
  // Integer arithmetic: round(gross * 100 / (100 + rate)), half-up.
  const denominator = 100 + rate;
  const netMinor = Math.floor((grossMinor * 200 + denominator) / (denominator * 2));
  return { netMinor, vatMinor: grossMinor - netMinor };
}
