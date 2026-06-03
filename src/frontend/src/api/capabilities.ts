/** Admin view-capability API — which roles may use the cycle selector / list view. */

import { getSetting, upsertSetting } from "./settings";

export type CapabilityConfig = Record<string, string[]>;

export const CAPABILITY_KEYS = ["cycle_selector", "list_view"] as const;
export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];

const CAPABILITY_SETTING_KEY = "access.capabilities";

const INTERNAL_ROLES = ["reader", "writer", "admin"];

// Mirror DEFAULT_CAPABILITIES on the backend: internal roles only, so anonymous
// public readers are excluded until an admin opts them in.
export const DEFAULT_CAPABILITIES: CapabilityConfig = {
  cycle_selector: INTERNAL_ROLES,
  list_view: INTERNAL_ROLES,
};

export async function getCapabilityConfig(): Promise<CapabilityConfig> {
  const row = await getSetting(CAPABILITY_SETTING_KEY);
  const merged: CapabilityConfig = { ...DEFAULT_CAPABILITIES };
  if (row.value) {
    try {
      const parsed = JSON.parse(row.value);
      if (parsed && typeof parsed === "object") {
        for (const [key, roles] of Object.entries(parsed)) {
          if (Array.isArray(roles)) merged[key] = roles as string[];
        }
      }
    } catch {
      /* ignore — keep defaults */
    }
  }
  return merged;
}

export async function saveCapabilityConfig(
  config: CapabilityConfig,
): Promise<void> {
  await upsertSetting(CAPABILITY_SETTING_KEY, JSON.stringify(config));
}

export function roleHasCapability(
  config: CapabilityConfig,
  capability: string,
  role: string,
): boolean {
  if (role === "admin") return true;
  const allowed = config[capability] ?? DEFAULT_CAPABILITIES[capability] ?? [];
  return allowed.includes(role);
}
