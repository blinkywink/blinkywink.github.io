import cardAccents from "../data/cardAccents.json";
import { cardSpecById } from "./cardCatalog";
import { normalizeAccentColor } from "./profileCosmetics";

type AccentRow = { primary?: string };

const accents = cardAccents as unknown as Record<string, AccentRow>;
const PARAGON_PRIMARY = "#0F7DFE";

/** Tower / path accent hex for a collectible card id. */
export function accentHexForCardId(
  cardId: string | null | undefined,
): string | null {
  const id = String(cardId ?? "").trim();
  if (!id) return null;
  const spec = cardSpecById(id);
  if (!spec) return null;
  if (spec.isParagon) return PARAGON_PRIMARY;
  return normalizeAccentColor(accents[spec.entity.id]?.primary);
}
