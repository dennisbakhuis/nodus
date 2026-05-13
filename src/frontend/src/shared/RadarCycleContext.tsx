import { createContext, useContext, useState, type ReactNode } from "react";

type CtxValue = {
  fullBleed: boolean;
  setFullBleed: (v: boolean) => void;
};

const Ctx = createContext<CtxValue>({
  fullBleed: false,
  setFullBleed: () => {},
});

export function RadarCycleProvider({ children }: { children: ReactNode }) {
  const [fullBleed, setFullBleed] = useState(false);
  return (
    <Ctx.Provider value={{ fullBleed, setFullBleed }}>{children}</Ctx.Provider>
  );
}

export function useRadarCycle() {
  return useContext(Ctx);
}
