// Coins, wardrobe unlocks, and pet roster persistence.

export type PetKind = 'cat' | 'dog';

export interface PetData {
  id: string;
  kind: PetKind;
  color: number; // 0-3 column block in the spritesheet
  name: string;
}

export const REWARDS = {
  fixMess: 5,
  feedPet: 2,
  gift: 10,
  puzzle: 15,
};

import { FANCY_HAIR_COLORS, FREE_HATS, SEXED_HAIR, SHARED_HAIR } from './config/content';

// Premium wardrobe items: option id -> price. Anything not listed is free.
// Keyed per category so ids can repeat across categories.
const ALL_HAIR_STYLES = [...new Set([...SHARED_HAIR, ...SEXED_HAIR.m, ...SEXED_HAIR.f])];
const hairPrices: Record<string, number> = {};
for (const s of ALL_HAIR_STYLES) for (const c of FANCY_HAIR_COLORS) hairPrices[`${s}_${c}`] = 20;
const configHatPrices: Record<string, number> = {};
for (const h of FREE_HATS) if (h.price > 0) configHatPrices[h.id] = h.price;

// Items that only exist in the secret market: hidden from the wardrobe
// until unlocked by buying them there.
export const SECRET_ITEMS: Record<string, string[]> = {
  hat: [
    'crown_gold', 'crown_silver', 'tiara_gold', 'tiara_silver',
    'wizard_teal', 'wizard_red', 'pirate_black', 'tophat_black',
    'elf_red', 'elf_green',
  ],
  pants: ['plate_gold', 'plate_iron'],
  dress: ['kimono_red', 'kimono_black', 'kimono_sky'],
  jewelry: ['marq_purple', 'marq_green', 'marq_red', 'ring_gold'],
};

export function isSecret(category: string, option: string): boolean {
  return SECRET_ITEMS[category]?.includes(option) ?? false;
}

export const PRICES: Record<string, Record<string, number>> = {
  hair: hairPrices,
  shirt: { long_purple: 15, short_pink: 15, blouse_sky: 15, sleeve_purple: 15 },
  pants: { pants_maroon: 10, skirt_forest: 10, plate_gold: 45, plate_iron: 35 },
  dress: { slit_purple: 25, bodice_purple: 25, sash_lavender: 20, kimono_red: 40, kimono_black: 40, kimono_sky: 40 },
  shoes: { shoes_red: 10, boots_red: 15, boots_gray: 15 },
  hat: {
    ...configHatPrices,
    crown_gold: 50, crown_silver: 40, tiara_gold: 50, tiara_silver: 40,
    wizard_teal: 35, wizard_red: 35, pirate_black: 30, tophat_black: 30,
    elf_red: 25, elf_green: 25,
  },
  jewelry: {
    marq_purple: 30, marq_green: 30, marq_red: 30, ring_gold: 35,
    gem_blue: 15,
    gem_green: 15,
    gem_purple: 15,
    gem_red: 15,
    star_gold: 25,
    star_silver: 15,
    cravat_purple: 10,
    amulet_gold_blue: 20,
    amulet_gold_red: 20,
    amulet_silver_green: 20,
  },
};

const COINS_KEY = 'tiny-house-coins';
const UNLOCKS_KEY = 'tiny-house-unlocks';
const PETS_KEY = 'tiny-house-pets';

export function loadCoins(): number {
  const n = Number(localStorage.getItem(COINS_KEY));
  return Number.isFinite(n) && n >= 0 ? n : 15;
}

export function saveCoins(coins: number) {
  localStorage.setItem(COINS_KEY, String(coins));
}

export function loadUnlocks(): Set<string> {
  try {
    const raw = localStorage.getItem(UNLOCKS_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch {
    /* fall through */
  }
  return new Set();
}

export function saveUnlocks(unlocks: Set<string>) {
  localStorage.setItem(UNLOCKS_KEY, JSON.stringify([...unlocks]));
}

export function priceOf(category: string, option: string): number {
  return PRICES[category]?.[option] ?? 0;
}

export function unlockKey(category: string, option: string): string {
  return `${category}:${option}`;
}

const CAT_NAMES = ['Whiskers', 'Mochi', 'Luna', 'Biscuit'];
const DOG_NAMES = ['Rex', 'Waffles', 'Pepper', 'Ziggy'];
let nextPetId = 1;

export function newPet(kind: PetKind): PetData {
  const names = kind === 'cat' ? CAT_NAMES : DOG_NAMES;
  return {
    id: `pet${Date.now()}_${nextPetId++}`,
    kind,
    color: Math.floor(Math.random() * 4),
    name: names[Math.floor(Math.random() * names.length)],
  };
}

export function loadPets(): PetData[] {
  try {
    const raw = localStorage.getItem(PETS_KEY);
    if (raw) {
      const pets = JSON.parse(raw) as PetData[];
      if (Array.isArray(pets)) return pets.filter((p) => p && (p.kind === 'cat' || p.kind === 'dog'));
    }
  } catch {
    /* fall through */
  }
  return [{ id: 'pet_first', kind: 'cat', color: 1, name: 'Whiskers' }];
}

export function savePets(pets: PetData[]) {
  localStorage.setItem(PETS_KEY, JSON.stringify(pets));
}
