import { SEGMENT_THEMES } from "../radar/segmentThemes";
import styles from "./CycleColorPicker.module.css";

type CycleColorPickerProps = {
  value: string | null | undefined;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function CycleColorPicker({
  value,
  onChange,
  disabled,
}: CycleColorPickerProps) {
  return (
    <div className={styles.presets} role="radiogroup" aria-label="Cycle color">
      {SEGMENT_THEMES.map((theme) => {
        const active = value === theme.key;
        return (
          <button
            key={theme.key}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            className={`${styles.presetBtn} ${active ? styles.presetBtnActive : ""}`}
            onClick={() => onChange(theme.key)}
          >
            <span
              className={styles.swatch}
              style={{ background: theme.labelText }}
              aria-hidden
            />
            {theme.label}
          </button>
        );
      })}
    </div>
  );
}
