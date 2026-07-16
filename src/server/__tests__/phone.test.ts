import { describe, it, expect } from "vitest";
import { phoneDigits, phoneMatches } from "../telegram.server";

describe("phoneDigits", () => {
  it("strips non-digit characters", () => {
    expect(phoneDigits("+998 (90) 392-11-22")).toBe("998903921122");
    expect(phoneDigits("+998-90-392-11-22")).toBe("998903921122");
    expect(phoneDigits(" 998 90 392 11 22 ")).toBe("998903921122");
  });

  it("keeps pure digit strings", () => {
    expect(phoneDigits("998903921122")).toBe("998903921122");
    expect(phoneDigits("903921122")).toBe("903921122");
  });

  it("handles numbers and unusual inputs", () => {
    expect(phoneDigits(998903921122)).toBe("998903921122");
    expect(phoneDigits(null)).toBe("");
    expect(phoneDigits(undefined)).toBe("");
    expect(phoneDigits("")).toBe("");
    expect(phoneDigits("abc")).toBe("");
  });
});

describe("phoneMatches", () => {
  it("matches identical normalized values", () => {
    expect(phoneMatches("998903921122", "998903921122")).toBe(true);
  });

  it("matches with +998 prefix vs 998", () => {
    expect(phoneMatches("+998903921122", "998903921122")).toBe(true);
    expect(phoneMatches("998903921122", "+998903921122")).toBe(true);
  });

  it("matches when one side has the 998 country prefix and the other does not", () => {
    expect(phoneMatches("903921122", "998903921122")).toBe(true);
    expect(phoneMatches("998903921122", "903921122")).toBe(true);
    expect(phoneMatches("+998 90 392 11 22", "903921122")).toBe(true);
  });

  it("matches by the last 9 digits regardless of formatting", () => {
    expect(phoneMatches("+998 (90) 392-11-22", "998903921122")).toBe(true);
    expect(phoneMatches("8-10-998-90-392-11-22", "903921122")).toBe(true);
  });

  it("does not match different numbers", () => {
    expect(phoneMatches("998903921122", "998903921133")).toBe(false);
    expect(phoneMatches("903921122", "913921122")).toBe(false);
  });

  it("returns false for empty / nullish input on either side", () => {
    expect(phoneMatches("", "998903921122")).toBe(false);
    expect(phoneMatches("998903921122", "")).toBe(false);
    expect(phoneMatches(null, "998903921122")).toBe(false);
    expect(phoneMatches(undefined, "998903921122")).toBe(false);
    expect(phoneMatches("abc", "xyz")).toBe(false);
  });
});
