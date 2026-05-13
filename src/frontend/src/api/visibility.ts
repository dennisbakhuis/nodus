/** Admin visibility-config API. */

import { getSetting, upsertSetting } from "./settings";

export type VisibilityConfig = Record<string, string[]>;

export async function getVisibilityConfig(): Promise<VisibilityConfig> {
  const row = await getSetting("visibility.field_roles");
  if (!row.value) return {};
  try {
    const parsed = JSON.parse(row.value);
    if (parsed && typeof parsed === "object") {
      return parsed as VisibilityConfig;
    }
  } catch {
    /* ignore — return empty */
  }
  return {};
}

export async function saveVisibilityConfig(
  config: VisibilityConfig,
): Promise<void> {
  await upsertSetting("visibility.field_roles", JSON.stringify(config));
}
