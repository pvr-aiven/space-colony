export type Cost = Record<string, number>;

// Cost to reach `targetLevel` (1-indexed) given a level-1 base cost and a
// per-level growth factor: base_cost * growth^(targetLevel - 1).
export function costForLevel(baseCost: Cost, growthFactor: number, targetLevel: number): Cost {
  const factor = growthFactor ** (targetLevel - 1);
  const scaled: Cost = {};
  for (const [code, amount] of Object.entries(baseCost)) {
    scaled[code] = Math.ceil(amount * factor);
  }
  return scaled;
}
