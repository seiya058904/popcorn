/** Chromium flags that keep WebGL on the real GPU when running headless. */
export const GPU_ARGS = [
  '--use-angle=d3d11',
  '--ignore-gpu-blocklist',
  '--enable-gpu-rasterization',
  '--enable-zero-copy',
  '--force-color-profile=srgb',
];

/** Extra flags for measuring uncapped frame times. */
export const UNCAPPED_ARGS = ['--disable-frame-rate-limit', '--disable-gpu-vsync'];
