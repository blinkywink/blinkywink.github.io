/** Shared instrument ids for Bloon Hero / Clone Hero charts. */

export type PlayableInstrument = "guitar" | "bass" | "drums";

export const PLAYABLE_INSTRUMENTS: PlayableInstrument[] = [
  "guitar",
  "bass",
  "drums",
];

export const INSTRUMENT_LABEL: Record<PlayableInstrument, string> = {
  guitar: "Guitar",
  bass: "Bass",
  drums: "Drums",
};

/** .chart Expert (then Hard/Med/Easy) track section names. */
export const CHART_TRACK_NAMES: Record<PlayableInstrument, string[]> = {
  guitar: ["Single"],
  bass: ["DoubleBass"],
  drums: ["Drums"],
};

/** MIDI PART track names (uppercase match). */
export const MIDI_TRACK_NAMES: Record<PlayableInstrument, string[]> = {
  guitar: ["PART GUITAR", "PART GUITAR COOP", "T1 GEMS"],
  bass: ["PART BASS", "PART RHYTHM"],
  drums: ["PART DRUMS"],
};
