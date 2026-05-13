import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { listCycles } from "../api/cycles";
import { useAuth } from "./AuthContext";
import type { CycleRead } from "../manage/types";
import styles from "./CyclePicker.module.css";

const SENTINEL_ACTIVE = "__active__";

export function CyclePicker() {
  const { canBrowseCycles } = useAuth();
  const [cycles, setCycles] = useState<CycleRead[] | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("cycle");

  useEffect(() => {
    if (!canBrowseCycles) {
      setCycles(null);
      return;
    }
    let cancelled = false;
    listCycles()
      .then((data) => {
        if (!cancelled) setCycles(data);
      })
      .catch(() => {
        if (!cancelled) setCycles([]);
      });
    return () => {
      cancelled = true;
    };
  }, [canBrowseCycles]);

  const { active, closed } = useMemo(() => {
    if (!cycles) return { active: null, closed: [] as CycleRead[] };
    return {
      active: cycles.find((c) => c.end_date === null) ?? null,
      closed: cycles.filter((c) => c.end_date !== null),
    };
  }, [cycles]);

  if (!canBrowseCycles) return null;
  if (!cycles || cycles.length === 0) return null;

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    const next = new URLSearchParams(searchParams);
    if (value === SENTINEL_ACTIVE) {
      next.delete("cycle");
    } else {
      next.set("cycle", value);
    }
    setSearchParams(next, { replace: true });
  }

  const currentValue = selectedId ?? SENTINEL_ACTIVE;

  return (
    <div className={styles.picker}>
      <select
        id="cycle-picker"
        className={styles.select}
        value={currentValue}
        onChange={handleChange}
        aria-label="Select cycle"
      >
        {active && (
          <option value={SENTINEL_ACTIVE}>{active.name} (Active)</option>
        )}
        {!active && <option value={SENTINEL_ACTIVE}>Current</option>}
        {closed.length > 0 && (
          <optgroup label="Closed cycles">
            {closed.map((cycle) => (
              <option key={cycle.id} value={cycle.id}>
                {cycle.name} ({cycle.start_date} → {cycle.end_date})
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </div>
  );
}
