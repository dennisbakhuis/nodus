import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type HelpContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  triggerRef: React.MutableRefObject<HTMLButtonElement | null>;
};

const HelpContext = createContext<HelpContextValue | null>(null);

type ProviderProps = {
  children: ReactNode;
};

export function HelpProvider({ children }: ProviderProps) {
  const [open, setOpenState] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
  }, []);

  const toggle = useCallback(() => {
    setOpenState((o) => !o);
  }, []);

  const value = useMemo<HelpContextValue>(
    () => ({ open, setOpen, toggle, triggerRef }),
    [open, setOpen, toggle],
  );

  return <HelpContext.Provider value={value}>{children}</HelpContext.Provider>;
}

export function useHelp(): HelpContextValue {
  const ctx = useContext(HelpContext);
  if (!ctx) {
    throw new Error("useHelp must be used within a HelpProvider");
  }
  return ctx;
}
