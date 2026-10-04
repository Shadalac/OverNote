// Shared gamification data: the credit economy that rewards checklist use,
// plus the catalog of purchasable themes and pets. Kept in one place so
// NoteEditor (which renders the Store/Settings UI) and App (which owns the
// actual credits/unlock state in the database) always agree on ids, costs,
// and labels.

export const CHECKLIST_CREATE_CREDITS = 10;
export const ITEM_COMPLETE_CREDITS = 5;
export const PET_CREDITS = 1;

// Buying a slot to create your own custom pet (name + uploaded image) — see
// "Custom pets" below. Priced in the same range as the built-in pets.
export const CUSTOM_PET_COST = 150;

// id "default" always ships unlocked (cost is informational only — App
// never charges for it). Renaming a label here is safe; renaming an `id`
// is not, since it's also used as the `data-theme` attribute value and as
// the persisted "unlocked" key.
//
// Each base theme has a "+" upgrade right after it — same identity, a
// brighter/more saturated accent, and a deeper, richer background (see the
// matching :global(html[data-theme="...-plus"]) block in App.svelte for the
// actual colors). A "+" theme's `requires` names the base theme's id: the
// Store only lets you buy it once you already own that base theme.
export const THEMES_CATALOG = [
  { id: "default", label: "Default", preview: "#0f8983", cost: 0 },
  { id: "cyberpunk", label: "Cyberpunk", preview: "#ff2ec4", cost: 250 },
  { id: "cyberpunk-plus", label: "Cyberpunk+", preview: "#ff6df0", cost: 150, requires: "cyberpunk" },
  { id: "neo-tokyo", label: "MookyGirl", preview: "#ff8fc7", cost: 250 },
  { id: "neo-tokyo-plus", label: "MookyGirl+", preview: "#ffb3dd", cost: 150, requires: "neo-tokyo" },
  { id: "solarwave", label: "Solarwave", preview: "#ff7a3d", cost: 250 },
  { id: "solarwave-plus", label: "Solarwave+", preview: "#ffa35c", cost: 150, requires: "solarwave" },
  { id: "radslime", label: "Radslime", preview: "#39ff14", cost: 250 },
  { id: "radslime-plus", label: "Radslime+", preview: "#7bff5a", cost: 150, requires: "radslime" },
  { id: "abyssal", label: "Abyssal", preview: "#2ea8ff", cost: 250 },
  { id: "abyssal-plus", label: "Abyssal+", preview: "#6cc9ff", cost: 150, requires: "abyssal" },
  { id: "bloodmoon", label: "Scarz", preview: "#ff3355", cost: 250 },
  { id: "bloodmoon-plus", label: "Scarz+", preview: "#ff6d85", cost: 150, requires: "bloodmoon" },
  { id: "amber-terminal", label: "Amber Terminal", preview: "#ffb000", cost: 250 },
  { id: "amber-terminal-plus", label: "Amber Terminal+", preview: "#ffcf4d", cost: 150, requires: "amber-terminal" },
  { id: "manta", label: "Manta", preview: "#6fae8c", cost: 250 },
  { id: "manta-plus", label: "Manta+", preview: "#9ad6b7", cost: 150, requires: "manta" },
];

// Custom pets (bought in the Store's "Create a custom pet" flow, named and
// given a user-uploaded image) aren't in this static catalog — each one is
// its own entry, persisted in appState's `customPets` array (App.svelte),
// built with this same generic voice since the user doesn't write one.
export const CUSTOM_PET_SAYINGS = [
  "hi!!",
  "*wags*",
  "hru?",
  ":)",
  "mlem",
  "*nuzzles*",
  "hey hey!",
  "<3",
  "*happy noises*",
  "pet me again?",
];

// `gifUrl` is left null for every built-in pet — each renders as a small
// hand-built CSS/SVG animation (see PetWindow.svelte) so the app stays
// fully offline with zero bundled assets. Setting a pet's `gifUrl` later
// (e.g. to a file dropped into src/assets) makes PetWindow render that
// image instead, with no other code changes needed.
//
// `sayings` is each pet's personality — the library of lines PetWindow
// picks one from (at random) every time you pet it, shown in a speech
// bubble over the frame. This is the one place to edit to change what a
// pet says, or to give a new pet its own voice: just add/edit the array,
// no other file needs to change. Mix statements, "pet me" asks, and (for a
// more animal/robotic pet) pure gibberish — whatever fits its character.
export const PETS_CATALOG = [
  {
    id: "glowbit",
    name: "Glowbit",
    cost: 125,
    kind: "orb",
    gifUrl: null,
    blurb: "A curious orb of soft light.",
    sayings: [
      "shhh-lume~",
      "glim... glim...",
      "*soft hum*",
      "vvvm...",
      "ting~",
      "lu-mee~",
      "*shimmers*",
      "hmmm-glow",
      "shwoop~",
      "*pulses softly*",
      "mmm-lite...",
      "glo glo glo~",
    ],
  },
  {
    // id kept as "pixelfox" (not renamed to match the new display name) so
    // anyone who's already bought this pet doesn't lose it — the catalog
    // entry an owned pet id points to can be re-skinned freely, but the id
    // itself is the persisted "you own this" key.
    id: "pixelfox",
    name: "PixaCat",
    cost: 125,
    kind: "fox",
    gifUrl: null,
    blurb: "An energetic cat-like holo.",
    sayings: [
      "mrowp!",
      "prrt prrt!",
      "mew-zzt!",
      "*chirrup*",
      "nyip!",
      "purrbzzt~",
      "mrr-yip!",
      "*happy trill*",
      "mewp mewp!",
      "zzzrowl~",
      "prrrt-chirp!",
      "mrow-blip!",
    ],
  },
  {
    id: "blipmoth",
    name: "Blipmoth",
    cost: 150,
    kind: "moth",
    gifUrl: null,
    blurb: "A flickering digital moth.",
    sayings: [
      "blip bliiip boop",
      "flrrp-zzt",
      "mrrp blip!",
      "ziggzagg~",
      "*flutters happily*",
      "bzzt... bzzt... blip!",
      "vworp vworp",
      "blip-blip-bloop",
      "*flickers*",
      "zzt zzt yay",
    ],
  },
  {
    // id kept as "sprocket" for the same reason noted on pixelfox above.
    id: "sprocket",
    name: "Sprocet",
    cost: 150,
    kind: "bot",
    gifUrl: null,
    blurb: "A bot-like holo.",
    sayings: [
      "beep-boop-beep",
      "whirr-click!",
      "*gear grinds happily*",
      "vrrt-vrrt",
      "click-click-beep!",
      "*static pop*",
      "bzzzt-boop",
      "whirrrr~",
      "tick-tick-ping!",
      "*servo whine*",
    ],
  },
];
