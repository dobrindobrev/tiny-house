# Tiny House

A touch-first "dollhouse" game prototype: walk a character around a room, dress
them up from a wardrobe, and make them nap in bed. Built with Phaser 3 + Vite +
TypeScript, playable in any browser including iPad Safari.

## Run it

```bash
npm install
npm run dev
```

Open the printed **Network** URL (e.g. `http://192.168.x.x:5173`) on an iPad on
the same Wi-Fi network to play with touch.

## How it works

- The character is a stack of 6 sprites (body, shoes, pants, shirt, head, hair)
  that all play the same walk animation in sync — swapping clothes = swapping
  one layer's texture (`src/Character.ts`).
- Wardrobe options and localStorage persistence live in `src/wardrobe.ts`.
- The room, tap-to-walk, and the bed/dresser interactions are in
  `src/RoomScene.ts`; the wardrobe panel UI is `src/WardrobeScene.ts`.

## Asset credits

Character sprites are from the **Universal LPC Spritesheet Character
Generator** collection, licensed CC-BY-SA 3.0 / GPL 3.0:

- Repository: https://github.com/sanderfrenken/Universal-LPC-Spritesheet-Character-Generator
- Online generator (browse/compose all layers): https://liberatedpixelcup.github.io/Universal-LPC-Spritesheet-Character-Generator/
- Per-file author credits: `public/assets/character/CREDITS.csv`
- Liberated Pixel Cup base assets on OpenGameArt: https://opengameart.org/content/lpc-collection

Pet sprites (`public/assets/pets/`) are **"[LPC] Cats and Dogs" by bluecarrot16**,
licensed CC-BY 3.0 / OGA-BY 3.0 / GPL:
https://opengameart.org/content/lpc-cats-and-dogs

If you distribute this game, keep the credits file and license notice.
Derivative sprite sheets must remain under CC-BY-SA/GPL.

The puzzle images in `public/assets/puzzles/` are generated placeholders. Put your own 600×800 JPGs there under the same file names.

## License

The code is MIT licensed. Assets keep the licenses listed above.
