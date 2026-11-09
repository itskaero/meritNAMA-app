import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, newNonce } from "@/lib/csp";

describe("content security policy", () => {
  it("allows only this app's scripts carrying the request's nonce, and no framing", () => {
    const csp = contentSecurityPolicy("abc123");
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'self'");
    // No third-party hosts anywhere.
    expect(csp).not.toMatch(/https?:/);
    // A nonce in style-src would disable 'unsafe-inline', which style attributes need.
    expect(csp).toMatch(/style-src 'self' 'unsafe-inline'(;|$)/);
  });

  it("adds unsafe-eval only in development, and makes a new nonce each time", () => {
    expect(contentSecurityPolicy("n", true)).toContain("'unsafe-eval'");
    expect(newNonce()).not.toBe(newNonce());
  });
});
