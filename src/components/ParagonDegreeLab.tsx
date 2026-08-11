import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { towerEntities } from "../data/towers";
import { findParagon } from "../lib/pathCombos";
import {
  PARAGON_MAX_DEGREE,
  PARAGON_MIN_DEGREE,
  paragonStage,
  paragonStageLabel,
  suggestedParagonValue,
  xpToNextDegree,
} from "../lib/paragonProgress";
import { profilePath } from "../lib/routes";
import { MonkeyCard } from "./MonkeyCard";
import { ParagonXpBar } from "./ParagonXpBar";
import { PageHeader } from "./PageHeader";

const PARAGON_TOWERS = towerEntities
  .filter((e) => e.type === "paragon")
  .map((e) => e.tower)
  .sort((a, b) => a.localeCompare(b));

const STAGE_DEGREES = [1, 20, 40, 60, 80, 100] as const;

export function ParagonDegreeLab() {
  const [tower, setTower] = useState(PARAGON_TOWERS[0] ?? "Ninja Monkey");
  const [degree, setDegree] = useState(1);
  const [theater, setTheater] = useState(false);
  const entity = useMemo(() => findParagon(tower), [tower]);
  const stage = paragonStage(degree);

  useEffect(() => {
    if (!theater) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTheater(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [theater]);

  if (!entity) {
    return (
      <div className="paragon-lab">
        <PageHeader title="Paragon lab" blurb="No paragon towers in the catalog." />
      </div>
    );
  }

  const card = (
    <MonkeyCard
      entity={entity}
      pathLevels={[5, 5, 5]}
      mode="focus"
      owned
      degree={degree}
      onSelect={() => setTheater(true)}
    />
  );

  const theaterPortal = theater
    ? createPortal(
        <div
          className="paragon-lab__theater"
          role="dialog"
          aria-modal="true"
          aria-label={`${entity.name} degree ${degree}`}
        >
          <button
            type="button"
            className="paragon-lab__theater-backdrop"
            aria-label="Close"
            onClick={() => setTheater(false)}
          />
          <div className="paragon-lab__theater-stage">
            <button
              type="button"
              className="btn btn--ghost btn--sm paragon-lab__theater-close"
              onClick={() => setTheater(false)}
            >
              ✕ Close
            </button>
            <MonkeyCard
              entity={entity}
              pathLevels={[5, 5, 5]}
              mode="focus"
              owned
              degree={degree}
            />
            <ParagonXpBar degree={degree} xp={0} />
            <label className="paragon-lab__theater-slider">
              <span>
                Degree {degree} · {paragonStageLabel(degree)}
              </span>
              <input
                type="range"
                min={PARAGON_MIN_DEGREE}
                max={PARAGON_MAX_DEGREE}
                value={degree}
                onChange={(e) => setDegree(Number(e.target.value))}
              />
            </label>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="paragon-lab">
      <PageHeader
        eyebrow="Hidden"
        title="Paragon degree lab"
        blurb="Preview every degree look. Nothing here is saved."
      />
      <main className="paragon-lab__main">
        <p className="paragon-lab__back">
          <Link to={profilePath()}>← Profile</Link>
        </p>

        <div className="paragon-lab__controls">
          <label>
            <span>Tower</span>
            <select
              value={tower}
              onChange={(e) => setTower(e.target.value)}
            >
              {PARAGON_TOWERS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="paragon-lab__slider">
            <span>
              Degree {degree} · {paragonStageLabel(degree)}
            </span>
            <input
              type="range"
              min={PARAGON_MIN_DEGREE}
              max={PARAGON_MAX_DEGREE}
              value={degree}
              onChange={(e) => setDegree(Number(e.target.value))}
            />
          </label>
          <p className="paragon-lab__meta">
            Stage {stage + 1}/6
            {degree < PARAGON_MAX_DEGREE
              ? ` · ${xpToNextDegree(degree).toLocaleString()} XP to next`
              : " · maxed"}
            {" · "}
            est. {suggestedParagonValue(degree).toLocaleString()} Cash
            {" · tap the card for fullscreen"}
          </p>
        </div>

        <div className="paragon-lab__focus">{card}</div>

        <div className="paragon-lab__stages">
          {STAGE_DEGREES.map((d) => (
            <button
              key={d}
              type="button"
              className={`paragon-lab__stage${degree === d ? " is-active" : ""}`}
              onClick={() => {
                setDegree(d);
                setTheater(true);
              }}
            >
              <MonkeyCard
                entity={entity}
                pathLevels={[5, 5, 5]}
                mode="preview"
                owned
                degree={d}
              />
              <span>
                {d} · {paragonStageLabel(d)}
              </span>
            </button>
          ))}
        </div>
      </main>
      {theaterPortal}
    </div>
  );
}
