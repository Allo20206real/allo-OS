// Built-in wallpapers. `light: true` means the wallpaper is bright, so the
// system draws dark text and icons on top of it.
export const WALLPAPERS = [
  {
    id: 'aurora', name: 'Aurora',
    css: `radial-gradient(110% 70% at 0% 0%, #7d6bff 0%, transparent 60%),
          radial-gradient(90% 60% at 100% 20%, #ff8fb4 0%, transparent 55%),
          radial-gradient(120% 80% at 80% 100%, #27c2d6 0%, transparent 60%),
          radial-gradient(100% 70% at 0% 100%, #3a52d6 0%, transparent 65%),
          linear-gradient(160deg, #4b3fbf, #2a3a9e)`
  },
  {
    id: 'ocean', name: 'Ocean',
    css: `radial-gradient(120% 70% at 100% 0%, #3fd0c9 0%, transparent 55%),
          radial-gradient(100% 70% at 0% 40%, #1e6fd9 0%, transparent 60%),
          radial-gradient(120% 80% at 50% 110%, #0b2a6b 0%, transparent 70%),
          linear-gradient(180deg, #1a7fc4, #0d2f73)`
  },
  {
    id: 'sunset', name: 'Sunset',
    css: `radial-gradient(110% 70% at 100% 0%, #ffcf7a 0%, transparent 55%),
          radial-gradient(110% 70% at 0% 30%, #ff7a7a 0%, transparent 60%),
          radial-gradient(120% 80% at 70% 100%, #7b3fbf 0%, transparent 65%),
          linear-gradient(170deg, #ff9468, #b2457f 60%, #5b2d8f)`
  },
  {
    id: 'forest', name: 'Forest',
    css: `radial-gradient(120% 70% at 0% 0%, #b6e388 0%, transparent 50%),
          radial-gradient(110% 80% at 100% 40%, #2fa58a 0%, transparent 60%),
          radial-gradient(120% 80% at 30% 100%, #0f4d43 0%, transparent 70%),
          linear-gradient(170deg, #4fa86a, #145a4c)`
  },
  {
    id: 'graphite', name: 'Graphite',
    css: `radial-gradient(100% 60% at 20% 0%, #5a5f6b 0%, transparent 60%),
          radial-gradient(100% 70% at 100% 100%, #3a3f4c 0%, transparent 60%),
          linear-gradient(180deg, #2d3038, #15161a)`
  },
  {
    id: 'midnight', name: 'Midnight',
    css: `radial-gradient(90% 50% at 80% 10%, rgba(80, 110, 255, .55) 0%, transparent 60%),
          radial-gradient(90% 60% at 0% 90%, rgba(150, 70, 255, .45) 0%, transparent 60%),
          linear-gradient(180deg, #0b0d1c, #05060b)`
  },
  {
    id: 'mist', name: 'Mist', light: true,
    css: `radial-gradient(110% 70% at 0% 0%, #ffffff 0%, transparent 60%),
          radial-gradient(110% 70% at 100% 30%, #c9dcff 0%, transparent 60%),
          radial-gradient(120% 80% at 30% 100%, #e3d6ff 0%, transparent 65%),
          linear-gradient(180deg, #eef2f8, #dfe6f2)`
  },
  {
    id: 'sand', name: 'Sand', light: true,
    css: `radial-gradient(110% 70% at 100% 0%, #fff4e2 0%, transparent 60%),
          radial-gradient(110% 70% at 0% 50%, #ffd9bd 0%, transparent 60%),
          radial-gradient(120% 80% at 70% 100%, #f2c9c0 0%, transparent 65%),
          linear-gradient(180deg, #f8eadb, #efd8c6)`
  }
];

export function findWallpaper(id) {
  return WALLPAPERS.find(w => w.id === id) || WALLPAPERS[0];
}
