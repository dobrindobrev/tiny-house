// Wardrobe manifest, transformation forms, and the saved "people" roster.
// Every option id maps to texture key(s) = file names under public/assets/character/
// Art styles themselves are configured in config/styles.ts; the tunable
// content lists (hair, hats, transformations, themes) live in config/content.ts.

import {
  FORM_DEFS,
  FREE_HATS,
  HAIR_COLORS as CFG_HAIR_COLORS,
  HAIR_MISSING_COLORS,
  SEXED_HAIR as CFG_SEXED_HAIR,
  SHARED_HAIR as CFG_SHARED_HAIR,
} from './config/content';

export type Sex = 'm' | 'f';
export type Category = 'skin' | 'hair' | 'shirt' | 'pants' | 'dress' | 'shoes' | 'jewelry' | 'hat';
export type Form = string; // ids come from config/content.ts FORM_DEFS

export const FORMS = FORM_DEFS;

function formDef(id: Form) {
  return FORM_DEFS.find((f) => f.id === id) ?? FORM_DEFS[0];
}

export interface Outfit {
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  dress: string;
  shoes: string;
  jewelry: string;
  hat: string;
}

export interface Person {
  id: string;
  sex: Sex;
  form: Form;
  outfit: Outfit;
}

const SKINS = ['light', 'amber', 'olive'];
const HAIR_COLORS = CFG_HAIR_COLORS;
const SHARED_HAIR = CFG_SHARED_HAIR;
const SEXED_HAIR = CFG_SEXED_HAIR;

function hairOptions(sex: Sex): string[] {
  const styles = [...SHARED_HAIR, ...SEXED_HAIR[sex]];
  return [
    'none',
    ...styles.flatMap((s) =>
      HAIR_COLORS.filter((c) => !HAIR_MISSING_COLORS[s]?.includes(c)).map((c) => `${s}_${c}`),
    ),
  ];
}

// Free/priced hats from config + secret-market treasures
const HATS = [
  'none',
  ...FREE_HATS.map((h) => h.id),
  'crown_gold', 'crown_silver', 'tiara_gold', 'tiara_silver',
  'wizard_teal', 'wizard_red', 'pirate_black', 'tophat_black',
  'elf_red', 'elf_green',
];

const SHOE_COLORS = ['black', 'brown', 'blue', 'red', 'maroon', 'navy', 'forest', 'sky'];

function shoeOptions(): string[] {
  return [
    ...SHOE_COLORS.map((c) => `shoes_${c}`),
    ...['brown', 'black', 'red', 'gray'].map((c) => `boots_${c}`),
    ...['brown', 'tan'].map((c) => `sandals_${c}`),
  ];
}

export const OPTIONS: Record<Sex, Record<Category, string[]>> = {
  m: {
    skin: SKINS,
    hair: hairOptions('m'),
    shirt: [
      ...['red', 'blue', 'green', 'white', 'purple', 'black', 'navy', 'orange', 'sky', 'teal', 'yellow'].map(
        (c) => `long_${c}`,
      ),
      ...['yellow', 'teal', 'pink', 'charcoal', 'red', 'blue', 'green', 'white', 'purple', 'orange'].map(
        (c) => `short_${c}`,
      ),
    ],
    pants: [
      ...['blue', 'black', 'brown', 'maroon', 'tan', 'charcoal', 'forest', 'navy', 'red'].map(
        (c) => `pants_${c}`,
      ),
      'plate_gold',
      'plate_iron',
    ],
    dress: [],
    shoes: shoeOptions(),
    jewelry: [
      'none',
      ...['red', 'blue', 'purple', 'black'].map((c) => `cravat_${c}`),
      'star_gold',
      'star_silver',
      ...['gold_blue', 'gold_red', 'silver_green'].map((c) => `amulet_${c}`),
      'ring_gold',
    ],
    hat: HATS,
  },
  f: {
    skin: SKINS,
    hair: hairOptions('f'),
    shirt: [
      ...['pink', 'white', 'red', 'yellow', 'sky', 'green', 'lavender', 'orange', 'teal'].map(
        (c) => `blouse_${c}`,
      ),
      ...['purple', 'teal', 'green', 'charcoal', 'red', 'blue', 'pink', 'white'].map((c) => `sleeve_${c}`),
    ],
    pants: [
      ...['red', 'blue', 'maroon', 'forest', 'black', 'sky', 'teal', 'pink'].map((c) => `skirt_${c}`),
      ...['blue', 'black', 'tan', 'brown', 'maroon', 'charcoal', 'red'].map((c) => `pants_${c}`),
      'plate_gold',
      'plate_iron',
    ],
    dress: [
      'none',
      ...['red', 'blue', 'forest', 'black', 'purple'].map((c) => `slit_${c}`),
      ...['pink', 'sky', 'yellow', 'lavender'].map((c) => `sash_${c}`),
      ...['red', 'green', 'purple', 'white'].map((c) => `bodice_${c}`),
      ...['red', 'black', 'sky'].map((c) => `kimono_${c}`),
    ],
    shoes: shoeOptions(),
    jewelry: [
      'none',
      ...['blue', 'green', 'purple', 'red'].map((c) => `gem_${c}`),
      'star_gold',
      'star_silver',
      ...['gold_blue', 'gold_red', 'silver_green'].map((c) => `amulet_${c}`),
      ...['purple', 'green', 'red'].map((c) => `marq_${c}`),
      'ring_gold',
    ],
    hat: HATS,
  },
};

export function texturesFor(sex: Sex, category: Category, option: string): string[] {
  if (option === 'none' || option === '') return [];
  switch (category) {
    case 'skin':
      return [`body_${sex}_${option}`, `head_${sex}_${option}`];
    case 'hair': {
      const style = option.slice(0, option.lastIndexOf('_'));
      return SHARED_HAIR.includes(style) ? [`hair_${option}`] : [`hair_${sex}_${option}`];
    }
    case 'shirt':
      return [`shirt_${sex}_${option}`];
    case 'pants':
      // 'pants_blue' | 'skirt_red' -> pants_m_blue / skirt_f_red
      return [option.replace('_', `_${sex}_`)];
    case 'dress':
      return [`dress_f_${option}`];
    case 'shoes':
      // 'shoes_black' | 'boots_red' | 'sandals_tan'
      return [option.replace('_', `_${sex}_`)];
    case 'jewelry':
      return [`jew_${sex}_${option}`];
    case 'hat':
      return [`hat_${option}`];
  }
}

/** Head texture for a transformed person ('' means: use the human skin head). */
export function formHeadTexture(person: Person): string {
  const def = formDef(person.form);
  if (def.head === 'human') return '';
  return def.head === 'unisex'
    ? `head_form_${person.form}`
    : `head_form_${person.form}_${person.sex}`;
}

/** Body texture override for a transformed person ('' means: use the human skin body). */
export function formBodyTexture(person: Person): string {
  if (!formDef(person.form).hasBody) return '';
  return `body_form_${person.form}_${person.sex}`;
}

export function formHasWings(form: Form): boolean {
  return !!formDef(form).wings;
}

export function formHasHorn(form: Form): boolean {
  return !!formDef(form).horn;
}

/** Every sheet needed to render this person right now. */
export function personTextureKeys(person: Person): string[] {
  const { sex, outfit } = person;
  const keys = [
    ...texturesFor(sex, 'skin', outfit.skin),
    ...texturesFor(sex, 'hair', outfit.hair),
    ...texturesFor(sex, 'shirt', outfit.shirt),
    ...texturesFor(sex, 'pants', outfit.pants),
    ...texturesFor(sex, 'dress', outfit.dress),
    ...texturesFor(sex, 'shoes', outfit.shoes),
    ...texturesFor(sex, 'jewelry', outfit.jewelry),
    ...texturesFor(sex, 'hat', outfit.hat),
  ];
  const head = formHeadTexture(person);
  const body = formBodyTexture(person);
  if (head) keys.push(head);
  if (body) keys.push(body);
  if (formHasWings(person.form)) keys.push('wings_bg', 'wings_fg');
  return keys;
}

export function allTextureKeys(): string[] {
  const keys = new Set<string>();
  for (const sex of ['m', 'f'] as Sex[]) {
    for (const cat of Object.keys(OPTIONS[sex]) as Category[]) {
      for (const opt of OPTIONS[sex][cat]) {
        texturesFor(sex, cat, opt).forEach((k) => keys.add(k));
      }
    }
  }
  for (const def of FORM_DEFS) {
    if (def.head === 'unisex') keys.add(`head_form_${def.id}`);
    if (def.head === 'sexed') {
      keys.add(`head_form_${def.id}_m`);
      keys.add(`head_form_${def.id}_f`);
    }
    if (def.hasBody) {
      keys.add(`body_form_${def.id}_m`);
      keys.add(`body_form_${def.id}_f`);
    }
  }
  keys.add('wings_bg');
  keys.add('wings_fg');
  return [...keys];
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function randomOutfit(sex: Sex): Outfit {
  const o = OPTIONS[sex];
  return {
    skin: pick(o.skin),
    hair: pick(o.hair.filter((h) => h !== 'none')),
    shirt: pick(o.shirt),
    pants: pick(o.pants),
    dress: 'none',
    shoes: pick(o.shoes),
    jewelry: 'none',
    hat: 'none',
  };
}

// ---------- persistence ----------

const SAVE_KEY = 'tiny-house-people';
let nextId = 1;

export function newPerson(sex: Sex): Person {
  return {
    id: `p${Date.now()}_${nextId++}`,
    sex,
    form: 'human',
    outfit: randomOutfit(sex),
  };
}

export function loadPeople(): Person[] {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const people = JSON.parse(raw) as Person[];
      if (Array.isArray(people) && people.length > 0) {
        for (const p of people) {
          const opts = OPTIONS[p.sex];
          if (!opts) return defaultPeople();
          // Migrate old saves and drop options that no longer exist
          if (!p.form || !FORMS.some((f) => f.id === p.form)) p.form = 'human';
          const fresh = randomOutfit(p.sex);
          p.outfit = { ...fresh, ...p.outfit };
          for (const cat of Object.keys(opts) as Category[]) {
            const valid = opts[cat];
            const val = p.outfit[cat];
            const isNoneOk = (cat === 'dress' || cat === 'jewelry' || cat === 'hair' || cat === 'hat') && val === 'none';
            if (!isNoneOk && !valid.includes(val)) p.outfit[cat] = fresh[cat];
          }
        }
        return people;
      }
    }
  } catch {
    /* corrupted -> default */
  }
  return defaultPeople();
}

function defaultPeople(): Person[] {
  return [
    {
      id: 'p_boy',
      sex: 'm',
      form: 'human',
      outfit: {
        skin: 'light',
        hair: 'bob_black',
        shirt: 'long_red',
        pants: 'pants_blue',
        dress: 'none',
        shoes: 'shoes_black',
        jewelry: 'none',
        hat: 'none',
      },
    },
    {
      id: 'p_girl',
      sex: 'f',
      form: 'human',
      outfit: {
        skin: 'amber',
        hair: 'pigtails_black',
        shirt: 'blouse_pink',
        pants: 'skirt_blue',
        dress: 'none',
        shoes: 'shoes_brown',
        jewelry: 'none',
        hat: 'none',
      },
    },
  ];
}

export function savePeople(people: Person[]) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(people));
}
// (localStorage writes are instrumented at call sites via debug.ts if needed)
