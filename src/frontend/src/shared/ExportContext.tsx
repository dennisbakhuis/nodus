import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { FilterState, RadarData, RadarEntry } from "../radar/types";

export type ExportTarget =
  | {
      mode: "radar";
      svgRef: React.RefObject<SVGSVGElement | null>;
      data: RadarData;
    }
  | {
      mode: "data";
      data: RadarData;
      filters: FilterState;
      filteredEntries: RadarEntry[];
      /** Hand-picked rows from the list view. When non-empty, the export
       * menu uses these instead of ``filteredEntries`` so the user can
       * cherry-pick across filter changes. */
      selectedEntries: RadarEntry[];
    };

type ExportContextValue = {
  target: ExportTarget | null;
  setTarget: (t: ExportTarget | null) => void;
};

const Ctx = createContext<ExportContextValue>({
  target: null,
  setTarget: () => {},
});

/** Provider that lets the page-level radar/list views publish what's currently
 * exportable, and the chrome (Layout header) render an Export button only when
 * something is in fact exportable. The Radar page publishes ``mode: "radar"``
 * (SVG/PNG/PDF visualization export); the List page publishes
 * ``mode: "data"`` (CSV/Excel/JSON of the filtered entries). */
export function ExportProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<ExportTarget | null>(null);
  const stableSet = useCallback((t: ExportTarget | null) => setTarget(t), []);
  const value = useMemo(
    () => ({ target, setTarget: stableSet }),
    [target, stableSet],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useExportTarget(): ExportContextValue {
  return useContext(Ctx);
}
