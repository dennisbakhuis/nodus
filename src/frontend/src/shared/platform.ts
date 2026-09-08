/**
 * Platform-dependent names for keyboard modifiers.
 *
 * The events themselves are already portable — `KeyboardEvent.altKey` is Alt on
 * Windows and Linux and Option on a Mac — so only the label has to change. "⌥"
 * shown to a Windows reader names a key that is not on their keyboard.
 */

type NavigatorUAData = { platform?: string };

/** True on macOS, iOS and iPadOS. */
export function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const uaData = (navigator as Navigator & { userAgentData?: NavigatorUAData })
    .userAgentData;
  // `navigator.platform` is deprecated but still the most reliable signal in
  // the browsers that do not ship `userAgentData`.
  const platform =
    uaData?.platform || navigator.platform || navigator.userAgent;
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** How to write the Alt/Option modifier in help text on this platform. */
export function altKeyLabel(): string {
  return isApplePlatform() ? "⌥" : "Alt";
}
