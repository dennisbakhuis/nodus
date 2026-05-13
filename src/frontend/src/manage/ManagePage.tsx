import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { useRadarCycle } from "../shared/RadarCycleContext";
import { ManageSidebar } from "./ManageSidebar";

export function ManagePage() {
  const { setFullBleed } = useRadarCycle();
  useEffect(() => {
    setFullBleed(true);
    return () => setFullBleed(false);
  }, [setFullBleed]);

  return (
    <div
      style={{
        display: "flex",
        flex: 1,
        minHeight: 0,
        height: "100%",
        background: "var(--color-page-background)",
      }}
    >
      <ManageSidebar />
      <main
        style={{
          flex: 1,
          minWidth: 0,
          overflowY: "auto",
          padding: "var(--space-6)",
        }}
      >
        <Outlet />
      </main>
    </div>
  );
}
