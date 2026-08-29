import type { CSSProperties, ReactNode, Ref } from "react";
import { BTD6_PACK_ART, type PackDef } from "../lib/packTheme";
import { staticAssetUrl } from "../lib/staticAssets";
import { BoosterPackFace } from "./BoosterPackFace";

type Props = {
  pack: PackDef;
  open?: boolean;
  /** Foil shimmer / breathe - off on shelf for perf. */
  effects?: boolean;
  children?: ReactNode;
  packRef?: Ref<HTMLDivElement>;
  className?: string;
};

/**
 * Shared foil pack shell (crimps + face).
 * Face art comes from BoosterPackFace (BTD6 cover or tower template).
 */
export function BoosterPack({
  pack,
  open = false,
  effects = true,
  children,
  packRef,
  className = "",
}: Props) {
  const artUrl =
    pack.kind === "btd6" ? (pack.coverArt ?? BTD6_PACK_ART) : undefined;

  return (
    <div
      className={`booster-wrap ${effects ? "" : "booster-wrap--static"} ${className}`.trim()}
      ref={packRef}
      style={
        artUrl
          ? ({
              ["--pack-art" as string]: `url(${staticAssetUrl(artUrl)})`,
            } as CSSProperties)
          : undefined
      }
    >
      <div className={`booster ${open ? "is-open" : "is-sealed"}`}>
        {children ?? (
          <div className="booster__model" aria-hidden>
            <div className="booster__pack">
              <div className="booster__crimp booster__crimp--top">
                <span className="booster__crimp-ridges" />
              </div>
              <div className="booster__face">
                <BoosterPackFace pack={pack} />
                {effects ? (
                  <>
                    <div className="booster__foil" />
                    <div className="booster__glare" />
                    <div className="booster__bulge" />
                  </>
                ) : null}
              </div>
              <div className="booster__crimp booster__crimp--bottom">
                <span className="booster__crimp-ridges" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
