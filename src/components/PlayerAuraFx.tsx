import type { CSSProperties } from "react";
import { playerChromeStyle } from "../lib/profileCosmetics";

type Props = {
  accentColor?: string | null;
  auraCardId?: string | null;
  className?: string;
};

/**
 * Holo foil / spark / glare overlay — same stack as MonkeyCard, for profile chrome.
 * Only renders when an aura card is equipped.
 */
export function PlayerAuraFx({
  accentColor,
  auraCardId,
  className = "",
}: Props) {
  if (!auraCardId) return null;

  const chrome = playerChromeStyle({ accentColor, auraCardId });
  const style = {
    ...chrome,
    ["--opacity" as string]: "0.9",
    ["--px" as string]: "42%",
    ["--py" as string]: "38%",
    // Aura purchase always gets visible FX; tier still boosts intensity.
    ["--holo-mul" as string]: String(
      Math.max(
        0.72,
        Number((chrome as Record<string, string>)["--player-holo"] ?? 0) || 0,
      ),
    ),
  } as CSSProperties;

  return (
    <span
      className={`player-aura-fx ${className}`.trim()}
      style={style}
      aria-hidden
    >
      <span className="player-aura-fx__foil" />
      <span className="player-aura-fx__glare" />
      <span className="player-aura-fx__spark" />
      <span className="player-aura-fx__sheen" />
    </span>
  );
}
