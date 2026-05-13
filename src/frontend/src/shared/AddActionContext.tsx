import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type AddActionTarget = {
  onClick: () => void;
};

type AddActionContextValue = {
  target: AddActionTarget | null;
  setTarget: (t: AddActionTarget | null) => void;
};

const Ctx = createContext<AddActionContextValue>({
  target: null,
  setTarget: () => {},
});

/** Provider that lets a page publish a primary "add" action and the Layout
 * header render an Add button only when something is in fact creatable.
 * Mirrors ExportContext so route gating + handler stays on the page. */
export function AddActionProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<AddActionTarget | null>(null);
  const stableSet = useCallback(
    (t: AddActionTarget | null) => setTarget(t),
    [],
  );
  const value = useMemo(
    () => ({ target, setTarget: stableSet }),
    [target, stableSet],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAddAction(): AddActionContextValue {
  return useContext(Ctx);
}
