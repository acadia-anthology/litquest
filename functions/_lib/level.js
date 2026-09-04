// Shared level math — used by every endpoint that returns a player. Level 0
// is 0-99 points, Level 1 is 100-199, and so on; points never reset.
export const POINTS_PER_LEVEL = 100;

export function withLevel(player) {
  const level = Math.floor(player.total_points / POINTS_PER_LEVEL);
  const points_into_level = player.total_points % POINTS_PER_LEVEL;
  return {
    ...player,
    level,
    points_into_level,
    points_to_next_level: POINTS_PER_LEVEL - points_into_level,
  };
}
