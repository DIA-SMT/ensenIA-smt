// Render at least 2 samples per CSS pixel, respecting native HiDPI density.
// Bound allocations to a 4K-class frame and the GPU's maximum render size.
export function renderScale(width, height, density = 1, hardwareLimit = 4096) {
  if (!(width > 0 && height > 0)) return 1;
  const desired = Math.max(2, Math.min(Number.isFinite(density) ? density : 1, 4));
  const edgeLimit = Math.max(1, Math.min(hardwareLimit, 4096));
  return Math.min(desired, edgeLimit / Math.max(width, height), Math.sqrt((3840 * 2160) / (width * height)));
}
