/** Shared instrument ids for Bloon Hero. */

export type PlayableInstrument = "guitar" | "vocals";

export const PLAYABLE_INSTRUMENTS: PlayableInstrument[] = [
  "guitar",
  "vocals",
];

export const INSTRUMENT_LABEL: Record<PlayableInstrument, string> = {
  guitar: "Guitar",
  vocals: "Vocals",
};

/** .chart Expert (then Hard/Med/Easy) track section names. */
export const CHART_TRACK_NAMES: Record<PlayableInstrument, string[]> = {
  guitar: ["Single"],
  // Vocals are almost always MIDI-only in CH packs.
  vocals: ["Vocals"],
};

/** MIDI PART track names (uppercase match). */
export const MIDI_TRACK_NAMES: Record<PlayableInstrument, string[]> = {
  guitar: ["PART GUITAR", "PART GUITAR COOP", "T1 GEMS"],
  vocals: ["PART VOCALS", "HARM1"],
};
