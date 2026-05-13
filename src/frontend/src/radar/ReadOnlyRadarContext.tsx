import { createContext, useContext, type ReactNode } from "react";

type ReadOnlyRadarContextValue = {
  readOnly: boolean;
};

const ReadOnlyRadarContext = createContext<ReadOnlyRadarContextValue>({
  readOnly: false,
});

export function ReadOnlyRadarProvider({
  readOnly,
  children,
}: {
  readOnly: boolean;
  children: ReactNode;
}) {
  return (
    <ReadOnlyRadarContext.Provider value={{ readOnly }}>
      {children}
    </ReadOnlyRadarContext.Provider>
  );
}

export function useReadOnlyRadar(): boolean {
  return useContext(ReadOnlyRadarContext).readOnly;
}
