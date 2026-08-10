/** Banana Catch background tracks (from iCloud ytmusic). */
const TRACK_FILES = [
  "Apotos (Day) - Sonic Unleashed [OST].mp3",
  "Banana Ranch.mp3",
  "Bloons TD Battles 2 Theme Music (Dance Remix).mp3",
  "Bloons on Fire.mp3",
  "Cool Edge (Day) - Sonic Unleashed [OST].mp3",
  "Don't Stop Pop.mp3",
  "Fiesta Flamenco.mp3",
  "Floral Fields - Kirby Triple Deluxe Soundtrack.mp3",
  "Green Greens - Kirby Triple Deluxe Soundtrack.mp3",
  "Impoppable.mp3",
  "Jazz Theme.mp3",
  "Jingle Bloons (Original Mix) - BTD6 - Tim Haywood.mp3",
  "Jumping Jalloons.mp3",
  "Just Another ZOMG.mp3",
  "Party Time (Fiesta Mix).mp3",
  "Pop Goes The Camo.mp3",
  "Sails Again ： Bloons Tower Defense 6 (Video Game Soundtrack).mp3",
  "Spice Island Party.mp3",
  "Sunset Samba.mp3",
  "Sunshine Serenade.mp3",
  "Title Music (Party Time).mp3",
  "Tribes & Tribulations.mp3",
  "Tropical Carnival.mp3",
  "Windmill Isle (Day) - Sonic Unleashed [OST].mp3",
  "Winter Is Coming, Bloons Tower Defense 6 (Video Game Soundtrack).mp3",
] as const;

export const CATCH_BGM_VOLUME = 0.15;

export const CATCH_BGM_TRACKS = TRACK_FILES.map(
  (name) => `/music/bananacatch/${encodeURIComponent(name)}`,
);
