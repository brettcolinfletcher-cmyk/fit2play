import { describe, expect, it } from "vitest";
import {
  addMonthsISO, deriveInvoiceStatus, renewalPastAgreement, hireBillingKind, hireFollowUps, hirePeriodCents, money, parseMoney, renewalPeriod,
} from "@/lib/practice/billing";

describe("money helpers", () => {
  it("formats negatives and parses loose input", () => {
    expect(money(-1050)).toBe("-$10.50");
    expect(money(12000)).toBe("$120.00");
    expect(parseMoney("$1,200.5")).toBe(120050);
    expect(parseMoney("-10")).toBe(-1000);
    expect(parseMoney("")).toBeNull();
  });
});

describe("addMonthsISO", () => {
  it("clamps to month end and crosses years", () => {
    expect(addMonthsISO("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsISO("2026-11-15", 2)).toBe("2027-01-15");
    expect(addMonthsISO("2028-01-31", 1)).toBe("2028-02-29");
  });
});

describe("renewalPeriod", () => {
  it("covers one interval from the renewal date", () => {
    expect(renewalPeriod({ next_renewal_date: "2026-12-01", start_date: "2026-11-01", interval_months: 1 }))
      .toEqual({ start: "2026-12-01", end: "2026-12-31", next: "2027-01-01" });
    expect(renewalPeriod({ next_renewal_date: null, start_date: "2026-11-10", interval_months: 3 }))
      .toEqual({ start: "2026-11-10", end: "2027-02-09", next: "2027-02-10" });
  });
});

describe("hire pricing", () => {
  it("detects billing kind and per-unit pricing", () => {
    expect(hireBillingKind({ one_off_fee_cents: 5000, subscription_cents: 2000 })).toBe("both");
    expect(hireBillingKind({ one_off_fee_cents: null, subscription_cents: 2000 })).toBe("subscription");
    expect(hireBillingKind({ one_off_fee_cents: 0, subscription_cents: null })).toBe("none");
    expect(hirePeriodCents({ subscription_cents: 2500, price_per_unit: true, units_count: 10 })).toBe(25000);
    expect(hirePeriodCents({ subscription_cents: 2500, price_per_unit: false, units_count: 10 })).toBe(2500);
  });
});

describe("hireFollowUps", () => {
  const base = { status: "active" as const, subscription_cents: 2000, units_count: 5 };
  it("flags overdue and upcoming renewals", () => {
    expect(hireFollowUps({ ...base, next_renewal_date: "2026-11-01" }, { owingCents: 0, oldestOverdueDue: null }, "2026-11-09")[0].reason).toBe("renewal_overdue");
    expect(hireFollowUps({ ...base, next_renewal_date: "2026-11-12" }, { owingCents: 0, oldestOverdueDue: null }, "2026-11-09")[0].label).toBe("Renews in 3d");
    expect(hireFollowUps({ ...base, next_renewal_date: "2026-12-30" }, { owingCents: 0, oldestOverdueDue: null }, "2026-11-09")).toEqual([]);
  });
  it("flags money owing and unreturned units", () => {
    const f = hireFollowUps({ ...base, status: "ended", next_renewal_date: null }, { owingCents: 4000, oldestOverdueDue: "2026-11-01" }, "2026-11-09");
    expect(f.map((x) => x.reason)).toEqual(["invoice_overdue", "units_out"]);
    const g = hireFollowUps({ ...base, status: "ended", next_renewal_date: null, units_returned_date: "2026-11-05" }, { owingCents: 0, oldestOverdueDue: null }, "2026-11-09");
    expect(g).toEqual([]);
  });
  it("ignores renewal for one-off hires", () => {
    expect(hireFollowUps({ ...base, subscription_cents: null, next_renewal_date: "2026-11-01" }, { owingCents: 0, oldestOverdueDue: null }, "2026-11-09")).toEqual([]);
  });
});

describe("agreement term", () => {
  const base = { status: "active" as const, subscription_cents: 2000, units_count: 5 };
  const none = { owingCents: 0, oldestOverdueDue: null };
  it("flags agreements ending soon or already ended", () => {
    expect(hireFollowUps({ ...base, next_renewal_date: "2026-12-30", agreed_until: "2026-11-20" }, none, "2026-11-09")[0].label).toBe("Agreement ends in 11d");
    expect(hireFollowUps({ ...base, next_renewal_date: "2026-12-30", agreed_until: "2026-11-01" }, none, "2026-11-09")[0].reason).toBe("agreement_ended");
    expect(hireFollowUps({ ...base, next_renewal_date: "2026-12-30", agreed_until: "2027-06-30" }, none, "2026-11-09")).toEqual([]);
  });
  it("stops renewal nags past the agreed end", () => {
    const f = hireFollowUps({ ...base, next_renewal_date: "2026-11-05", agreed_until: "2026-10-31" }, none, "2026-11-09");
    expect(f.map((x) => x.reason)).toEqual(["agreement_ended"]);
    expect(renewalPastAgreement({ next_renewal_date: "2026-11-05", start_date: "2026-01-01", interval_months: 1, agreed_until: "2026-10-31" })).toBe(true);
    expect(renewalPastAgreement({ next_renewal_date: "2026-10-01", start_date: "2026-01-01", interval_months: 1, agreed_until: "2026-10-31" })).toBe(false);
  });
});

describe("deriveInvoiceStatus", () => {
  it("handles paid, part paid, void and credits", () => {
    expect(deriveInvoiceStatus("sent", 10000, 10000, true)).toBe("paid");
    expect(deriveInvoiceStatus("draft", 10000, 2000, false)).toBe("part_paid");
    expect(deriveInvoiceStatus("void", 10000, 10000, true)).toBe("void");
    expect(deriveInvoiceStatus("paid", 10000, 0, true)).toBe("sent");
    expect(deriveInvoiceStatus("part_paid", 5000, 5000, true)).toBe("paid");
  });
});
