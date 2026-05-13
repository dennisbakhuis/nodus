import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type DemoDwellInfo = {
  /** Total dwell duration in ms — drives the timer-bar animation. */
  duration: number;
  /** Monotonic id; changes on every new dwell. Use as a React `key` so the
   * progress bar re-mounts and its CSS animation restarts cleanly. */
  key: number;
};

export type DemoModeTarget = {
  onClick: () => void;
  running: boolean;
  /** When the demo is mid-dwell (i.e. the side panel is open and waiting),
   * this carries the duration so the header can render a countdown bar. */
  dwell: DemoDwellInfo | null;
};

type DemoModeContextValue = {
  target: DemoModeTarget | null;
  setTarget: (t: DemoModeTarget | null) => void;
};

const Ctx = createContext<DemoModeContextValue>({
  target: null,
  setTarget: () => {},
});

/** Provider that lets the radar page publish a start/stop handler for the
 * presentation-mode tour, so the Layout header can render its toggle button
 * only when the radar is mounted AND the feature is enabled in settings.
 * Mirrors AddActionContext / ExportContext. */
export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<DemoModeTarget | null>(null);
  const stableSet = useCallback((t: DemoModeTarget | null) => setTarget(t), []);
  const value = useMemo(
    () => ({ target, setTarget: stableSet }),
    [target, stableSet],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDemoMode(): DemoModeContextValue {
  return useContext(Ctx);
}
