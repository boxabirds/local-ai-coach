import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { STEP_MS, useThrottledText } from "../use-throttled-text";

/** The answer grows in half-second steps (Ceetrix story 24, TC-01 to TC-05). Made-up text. */
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const grow = (n: number) => "word ".repeat(n);

describe("useThrottledText", () => {
  it("TC-01 the first text shows at once", () => {
    const { result } = renderHook(({ text }) => useThrottledText(text), { initialProps: { text: grow(1) } });
    expect(result.current).toBe(grow(1));
  });

  it("TC-02 changes inside a step wait for the step, then the newest shows", () => {
    const { result, rerender } = renderHook(({ text }) => useThrottledText(text), { initialProps: { text: grow(1) } });
    for (let n = 2; n <= 11; n += 1) {
      act(() => { vi.advanceTimersByTime(40); });
      rerender({ text: grow(n) });
      expect(result.current).toBe(grow(1));
    }
    act(() => { vi.advanceTimersByTime(STEP_MS); });
    expect(result.current).toBe(grow(11));
  });

  it("TC-03 steady changes for two seconds show at most one value per step", () => {
    const shown = new Set<string>();
    const { result, rerender } = renderHook(({ text }) => useThrottledText(text), { initialProps: { text: grow(1) } });
    shown.add(result.current);
    for (let n = 2; n <= 100; n += 1) {
      act(() => { vi.advanceTimersByTime(20); });
      rerender({ text: grow(n) });
      shown.add(result.current);
    }
    expect(shown.size).toBeLessThanOrEqual(2000 / STEP_MS + 1);
  });

  it("TC-04 nothing received is held longer than one step", () => {
    const { result, rerender } = renderHook(({ text }) => useThrottledText(text), { initialProps: { text: grow(1) } });
    act(() => { vi.advanceTimersByTime(100); });
    rerender({ text: grow(2) });
    act(() => { vi.advanceTimersByTime(STEP_MS - 100 - 1); });
    expect(result.current).toBe(grow(1));
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBe(grow(2));
  });

  it("TC-05 a shorter or replaced text shows at once", () => {
    const { result, rerender } = renderHook(({ text }) => useThrottledText(text), { initialProps: { text: grow(5) } });
    rerender({ text: "another answer" });
    expect(result.current).toBe("another answer");
  });

  it("TC-05 an unmount with a step pending updates nothing", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender, unmount } = renderHook(({ text }) => useThrottledText(text), { initialProps: { text: grow(1) } });
    rerender({ text: grow(2) });
    unmount();
    act(() => { vi.advanceTimersByTime(STEP_MS * 2); });
    expect(vi.getTimerCount()).toBe(0);
    expect(errors).not.toHaveBeenCalled();
  });
});
