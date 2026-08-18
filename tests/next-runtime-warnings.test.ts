import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Next.js runtime warning guards", () => {
  it("declares intentional smooth scrolling on the root html element", () => {
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(layout).toContain('data-scroll-behavior="smooth"');
  });

  it("uses fill sizing for the cover-style landing hero image", () => {
    const landing = readFileSync("components/landing.tsx", "utf8");
    const css = readFileSync("app/globals.css", "utf8");
    expect(landing).toContain('className="reference-hero__image-frame"');
    expect(landing).toMatch(/<Image[\s\S]*?src=\{heroImage\}[\s\S]*?\bfill\b/);
    expect(landing).toContain('sizes="(max-width: 900px) 116vw');
    expect(landing).not.toContain('width="1030"');
    expect(css).toMatch(/\.reference-hero__image-frame\s*\{[\s\S]*?position:\s*relative/);
  });

  it("provides a real favicon before the catch-all route", () => {
    const favicon = readFileSync("app/favicon.ico");
    expect(favicon.readUInt16LE(0)).toBe(0);
    expect(favicon.readUInt16LE(2)).toBe(1);
    expect(favicon.readUInt16LE(4)).toBeGreaterThan(0);
  });
});
