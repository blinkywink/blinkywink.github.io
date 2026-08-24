/** BTD6 freeplay round compositions (rounds 1-100). */

export type BloonBase =
  | "red"
  | "blue"
  | "green"
  | "yellow"
  | "pink"
  | "black"
  | "white"
  | "purple"
  | "zebra"
  | "lead"
  | "rainbow"
  | "ceramic"
  | "moab"
  | "bfb"
  | "zomg"
  | "ddt"
  | "bad";

export type BloonProp = "camo" | "regrow" | "fortified";

export type RoundSpawn = {
  base: BloonBase;
  props: BloonProp[];
  count: number;
};

export type RoundDef = {
  round: number;
  spawns: RoundSpawn[];
};

const B = (
  count: number,
  base: BloonBase,
  ...props: BloonProp[]
): RoundSpawn => ({ base, props, count });

/** Icon path under /images/bloons/btd6/. */
export function resolveBloonSrc(spawn: RoundSpawn): string {
  const order: BloonProp[] = ["camo", "regrow", "fortified"];
  const props = order.filter((p) => spawn.props.includes(p));
  const exact = [...props, spawn.base].join("-");
  // Wiki uses CamoRegrowFortified*; our download key matches that order.
  const mapped =
    exact === "camo-regrow-fortified-ceramic" ||
    exact === "fortified-camo-regrow-ceramic"
      ? "camo-regrow-fortified-ceramic"
      : exact === "camo-regrow-fortified-lead" ||
          exact === "fortified-camo-regrow-lead"
        ? "camo-regrow-fortified-lead"
        : exact;
  return `/images/bloons/btd6/${mapped}.webp`;
}

export function bloonLabel(spawn: RoundSpawn): string {
  const bits = [
    ...spawn.props.map((p) => p[0]!.toUpperCase() + p.slice(1)),
    spawn.base.toUpperCase(),
  ];
  return bits.join(" ");
}

export const ROUNDS: RoundDef[] = [
  { round: 1, spawns: [B(20, "red")] },
  { round: 2, spawns: [B(35, "red")] },
  { round: 3, spawns: [B(25, "red"), B(5, "blue")] },
  { round: 4, spawns: [B(35, "red"), B(18, "blue")] },
  { round: 5, spawns: [B(5, "red"), B(27, "blue")] },
  { round: 6, spawns: [B(15, "red"), B(15, "blue"), B(4, "green")] },
  { round: 7, spawns: [B(20, "red"), B(20, "blue"), B(5, "green")] },
  { round: 8, spawns: [B(10, "red"), B(20, "blue"), B(14, "green")] },
  { round: 9, spawns: [B(30, "green")] },
  { round: 10, spawns: [B(102, "blue")] },
  { round: 11, spawns: [B(10, "red"), B(10, "blue"), B(12, "green"), B(3, "yellow")] },
  { round: 12, spawns: [B(15, "blue"), B(10, "green"), B(5, "yellow")] },
  { round: 13, spawns: [B(50, "blue"), B(23, "green")] },
  { round: 14, spawns: [B(49, "red"), B(15, "blue"), B(10, "green"), B(9, "yellow")] },
  { round: 15, spawns: [B(20, "red"), B(15, "blue"), B(12, "green"), B(10, "yellow"), B(5, "pink")] },
  { round: 16, spawns: [B(40, "green"), B(8, "yellow")] },
  { round: 17, spawns: [B(12, "yellow", "regrow")] },
  { round: 18, spawns: [B(80, "green")] },
  { round: 19, spawns: [B(10, "green"), B(4, "yellow"), B(5, "yellow", "regrow"), B(15, "pink")] },
  { round: 20, spawns: [B(6, "black")] },
  { round: 21, spawns: [B(40, "yellow"), B(14, "pink")] },
  { round: 22, spawns: [B(16, "white")] },
  { round: 23, spawns: [B(7, "black"), B(7, "white")] },
  { round: 24, spawns: [B(20, "blue"), B(1, "green", "camo")] },
  { round: 25, spawns: [B(25, "yellow", "regrow"), B(10, "purple")] },
  { round: 26, spawns: [B(23, "pink"), B(4, "zebra")] },
  { round: 27, spawns: [B(100, "red"), B(60, "blue"), B(45, "green"), B(45, "yellow")] },
  { round: 28, spawns: [B(6, "lead")] },
  { round: 29, spawns: [B(50, "yellow"), B(15, "yellow", "regrow")] },
  { round: 30, spawns: [B(9, "lead")] },
  { round: 31, spawns: [B(8, "black"), B(8, "white"), B(8, "zebra"), B(2, "zebra", "regrow")] },
  { round: 32, spawns: [B(15, "black"), B(20, "white"), B(10, "purple")] },
  { round: 33, spawns: [B(20, "red", "camo"), B(13, "yellow", "camo")] },
  { round: 34, spawns: [B(160, "yellow"), B(6, "zebra")] },
  { round: 35, spawns: [B(35, "pink"), B(30, "black"), B(25, "white"), B(5, "rainbow")] },
  { round: 36, spawns: [B(140, "pink"), B(20, "green", "camo", "regrow")] },
  { round: 37, spawns: [B(25, "black"), B(25, "white"), B(7, "white", "camo"), B(10, "zebra"), B(15, "lead")] },
  { round: 38, spawns: [B(42, "pink"), B(17, "white"), B(10, "zebra"), B(14, "lead"), B(2, "ceramic")] },
  { round: 39, spawns: [B(10, "black"), B(10, "white"), B(20, "zebra"), B(18, "rainbow"), B(2, "rainbow", "regrow")] },
  { round: 40, spawns: [B(1, "moab")] },
  { round: 41, spawns: [B(60, "black"), B(60, "zebra")] },
  { round: 42, spawns: [B(6, "rainbow", "regrow"), B(5, "rainbow", "camo")] },
  { round: 43, spawns: [B(10, "rainbow"), B(7, "ceramic")] },
  { round: 44, spawns: [B(50, "zebra")] },
  { round: 45, spawns: [B(180, "pink"), B(10, "purple", "camo"), B(4, "lead", "fortified"), B(25, "rainbow")] },
  { round: 46, spawns: [B(6, "ceramic", "fortified")] },
  { round: 47, spawns: [B(70, "pink", "camo"), B(12, "ceramic")] },
  { round: 48, spawns: [B(40, "pink", "regrow"), B(30, "purple", "camo", "regrow"), B(40, "rainbow"), B(3, "ceramic", "fortified")] },
  { round: 49, spawns: [B(343, "green"), B(20, "zebra"), B(20, "rainbow"), B(10, "rainbow", "regrow"), B(18, "ceramic")] },
  { round: 50, spawns: [B(20, "red"), B(8, "lead", "fortified"), B(20, "ceramic"), B(2, "moab")] },
  { round: 51, spawns: [B(10, "rainbow", "regrow"), B(15, "ceramic", "camo")] },
  { round: 52, spawns: [B(25, "rainbow"), B(10, "ceramic"), B(2, "moab")] },
  { round: 53, spawns: [B(80, "pink", "camo"), B(3, "moab")] },
  { round: 54, spawns: [B(35, "ceramic"), B(2, "moab")] },
  { round: 55, spawns: [B(45, "ceramic"), B(1, "moab")] },
  { round: 56, spawns: [B(40, "rainbow", "camo"), B(1, "moab")] },
  { round: 57, spawns: [B(40, "rainbow"), B(4, "moab")] },
  { round: 58, spawns: [B(15, "ceramic"), B(10, "ceramic", "fortified"), B(5, "moab")] },
  { round: 59, spawns: [B(50, "lead", "camo"), B(20, "ceramic"), B(10, "ceramic", "regrow")] },
  { round: 60, spawns: [B(1, "bfb")] },
  { round: 61, spawns: [B(150, "zebra", "regrow"), B(5, "moab")] },
  { round: 62, spawns: [B(250, "purple"), B(15, "rainbow", "camo", "regrow"), B(5, "moab"), B(2, "moab", "fortified")] },
  { round: 63, spawns: [B(75, "lead"), B(122, "ceramic")] },
  { round: 64, spawns: [B(6, "moab"), B(3, "moab", "fortified")] },
  { round: 65, spawns: [B(100, "zebra"), B(70, "rainbow"), B(50, "ceramic"), B(3, "moab"), B(2, "bfb")] },
  { round: 66, spawns: [B(8, "moab"), B(3, "moab", "fortified")] },
  { round: 67, spawns: [B(13, "ceramic", "camo", "regrow", "fortified"), B(8, "moab")] },
  { round: 68, spawns: [B(4, "moab"), B(1, "bfb")] },
  { round: 69, spawns: [B(40, "black", "regrow"), B(40, "lead", "fortified"), B(50, "ceramic")] },
  { round: 70, spawns: [B(120, "white", "camo", "regrow"), B(200, "rainbow"), B(4, "moab")] },
  { round: 71, spawns: [B(30, "ceramic"), B(10, "moab")] },
  { round: 72, spawns: [B(38, "ceramic", "regrow"), B(2, "bfb")] },
  { round: 73, spawns: [B(8, "moab"), B(2, "bfb")] },
  { round: 74, spawns: [B(50, "ceramic"), B(60, "ceramic", "fortified"), B(25, "ceramic", "camo", "regrow", "fortified"), B(1, "bfb")] },
  { round: 75, spawns: [B(14, "lead"), B(14, "lead", "fortified"), B(3, "moab", "fortified"), B(7, "bfb")] },
  { round: 76, spawns: [B(60, "ceramic", "regrow")] },
  { round: 77, spawns: [B(11, "moab"), B(5, "bfb")] },
  { round: 78, spawns: [B(80, "purple"), B(150, "rainbow"), B(75, "ceramic"), B(72, "ceramic", "camo"), B(1, "bfb")] },
  { round: 79, spawns: [B(500, "rainbow", "regrow"), B(4, "bfb"), B(2, "bfb", "fortified")] },
  { round: 80, spawns: [B(1, "zomg")] },
  { round: 81, spawns: [B(17, "bfb")] },
  { round: 82, spawns: [B(10, "bfb"), B(5, "bfb", "fortified")] },
  { round: 83, spawns: [B(40, "ceramic"), B(40, "ceramic", "regrow"), B(40, "ceramic", "fortified"), B(30, "moab")] },
  { round: 84, spawns: [B(50, "moab"), B(10, "bfb")] },
  { round: 85, spawns: [B(2, "zomg")] },
  { round: 86, spawns: [B(5, "bfb", "fortified")] },
  { round: 87, spawns: [B(4, "zomg")] },
  { round: 88, spawns: [B(18, "moab"), B(8, "bfb"), B(2, "zomg")] },
  { round: 89, spawns: [B(20, "moab", "fortified"), B(8, "bfb", "fortified")] },
  { round: 90, spawns: [B(50, "lead", "camo", "regrow", "fortified"), B(3, "ddt")] },
  { round: 91, spawns: [B(100, "ceramic", "fortified"), B(20, "bfb")] },
  { round: 92, spawns: [B(50, "moab", "fortified"), B(4, "zomg")] },
  { round: 93, spawns: [B(10, "bfb", "fortified"), B(6, "ddt")] },
  { round: 94, spawns: [B(25, "bfb"), B(6, "zomg")] },
  { round: 95, spawns: [B(500, "purple", "camo", "regrow"), B(250, "lead", "camo", "regrow", "fortified"), B(50, "moab", "fortified"), B(30, "ddt")] },
  { round: 96, spawns: [B(40, "moab", "fortified"), B(30, "bfb"), B(6, "zomg")] },
  { round: 97, spawns: [B(2, "zomg", "fortified")] },
  { round: 98, spawns: [B(30, "bfb", "fortified"), B(8, "zomg")] },
  { round: 99, spawns: [B(60, "moab"), B(9, "ddt", "fortified")] },
  { round: 100, spawns: [B(1, "bad")] },
];

export function pickRandomRound(avoid: number[] = []): RoundDef {
  const blocked = new Set(avoid);
  const pool = ROUNDS.filter((r) => !blocked.has(r.round));
  const list = pool.length ? pool : ROUNDS;
  return list[Math.floor(Math.random() * list.length)]!;
}
