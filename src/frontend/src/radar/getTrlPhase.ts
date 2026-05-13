export type TrlPhase =
  | "Discovery"
  | "Development"
  | "Demonstration"
  | "Deployment"
  | "Scale"
  | "Invalid";

export function getTrlPhase(trl: number | null | undefined): TrlPhase {
  if (trl === null || trl === undefined) return "Invalid";
  if (trl >= 1 && trl <= 3) return "Discovery";
  if (trl >= 4 && trl <= 6) return "Development";
  if (trl >= 7 && trl <= 8) return "Demonstration";
  if (trl === 9) return "Deployment";
  if (trl >= 10 && trl <= 12) return "Scale";
  return "Invalid";
}
