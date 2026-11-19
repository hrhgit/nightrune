// Numeric rule constants. Placeholders; change them here only.
export const RULES = {
  /** Slots per line (R-01). */
  lineLength: 4,
  /** Player starting HP for a run (R-01). */
  playerHp: 30,
  /** The player loses if the enemy is still alive after this round (R-11). */
  maxRounds: 20,
} as const;
