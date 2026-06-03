import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  ResizeHandle,
  useResizableWidth,
} from "../../src/shared/useResizableWidth";

beforeEach(() => {
  const mem: Record<string, string> = {};
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (k in mem ? mem[k] : null),
    setItem: (k: string, v: string) => {
      mem[k] = v;
    },
    removeItem: (k: string) => {
      delete mem[k];
    },
    clear: () => {
      for (const k of Object.keys(mem)) delete mem[k];
    },
  });
  // jsdom doesn't implement pointer capture.
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function Probe() {
  const { width, onPointerDown, reset } = useResizableWidth("test.width", {
    min: 100,
    max: 300,
    initial: 150,
  });
  return (
    <div style={{ position: "relative" }}>
      <span data-testid="w">{width}</span>
      <button onClick={reset}>reset</button>
      <ResizeHandle onPointerDown={onPointerDown} onDoubleClick={reset} />
    </div>
  );
}

function drag(handle: HTMLElement, toX: number) {
  fireEvent.pointerDown(handle, { clientX: 0, pointerId: 1 });
  fireEvent.pointerMove(handle, { clientX: toX });
  fireEvent.pointerUp(handle, { clientX: toX });
}

describe("useResizableWidth", () => {
  it("starts at the initial width", () => {
    render(<Probe />);
    expect(screen.getByTestId("w").textContent).toBe("150");
  });

  it("resizes on drag, clamps to max, and persists", () => {
    render(<Probe />);
    const handle = screen.getByRole("separator", { name: "Resize sidebar" });

    fireEvent.pointerDown(handle, { clientX: 0, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 80 });
    expect(screen.getByTestId("w").textContent).toBe("230");

    fireEvent.pointerMove(handle, { clientX: 500 });
    expect(screen.getByTestId("w").textContent).toBe("300"); // clamped to max
    fireEvent.pointerUp(handle, { clientX: 500 });

    expect(localStorage.getItem("test.width")).toBe("300");
  });

  it("clamps to the minimum width", () => {
    render(<Probe />);
    const handle = screen.getByRole("separator", { name: "Resize sidebar" });
    drag(handle, -500);
    expect(screen.getByTestId("w").textContent).toBe("100");
  });

  it("reset restores the initial width", () => {
    render(<Probe />);
    const handle = screen.getByRole("separator", { name: "Resize sidebar" });
    drag(handle, 100);
    expect(screen.getByTestId("w").textContent).toBe("250");
    fireEvent.click(screen.getByText("reset"));
    expect(screen.getByTestId("w").textContent).toBe("150");
  });

  it("loads a persisted width on mount (clamped)", () => {
    localStorage.setItem("test.width", "275");
    render(<Probe />);
    expect(screen.getByTestId("w").textContent).toBe("275");
  });
});
