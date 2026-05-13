import { render, screen, fireEvent } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it } from "vitest";
import {
  DemoModeProvider,
  useDemoMode,
} from "../../src/shared/DemoModeContext";

function Publisher({
  onClick,
  running,
}: {
  onClick: () => void;
  running: boolean;
}) {
  const { setTarget } = useDemoMode();
  useEffect(() => {
    setTarget({ onClick, running, dwell: null });
    return () => setTarget(null);
  }, [onClick, running, setTarget]);
  return null;
}

function Consumer() {
  const { target } = useDemoMode();
  if (!target) return <span data-testid="demo-state">no-target</span>;
  return (
    <button data-testid="demo-btn" onClick={target.onClick}>
      {target.running ? "stop" : "start"}
    </button>
  );
}

describe("DemoModeContext", () => {
  it("starts with no target", () => {
    render(
      <DemoModeProvider>
        <Consumer />
      </DemoModeProvider>,
    );
    expect(screen.getByTestId("demo-state").textContent).toBe("no-target");
  });

  it("a publisher exposes onClick and running through the context", () => {
    const clicks: number[] = [];
    render(
      <DemoModeProvider>
        <Publisher onClick={() => clicks.push(1)} running={false} />
        <Consumer />
      </DemoModeProvider>,
    );
    const btn = screen.getByTestId("demo-btn");
    expect(btn.textContent).toBe("start");
    fireEvent.click(btn);
    expect(clicks).toHaveLength(1);
  });

  it("running flag flips the consumer label", () => {
    render(
      <DemoModeProvider>
        <Publisher onClick={() => {}} running={true} />
        <Consumer />
      </DemoModeProvider>,
    );
    expect(screen.getByTestId("demo-btn").textContent).toBe("stop");
  });
});
