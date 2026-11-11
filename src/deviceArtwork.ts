import type { Kind } from './networkTypes';

export type DeviceArtwork = {
  /** File in public/, for example '/devices/router.svg'. */
  src: string;
  /** Canvas units. Keep the device base near (0, 0). */
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Shared by the canvas, library and dialog preview. Missing entries use built-in vectors. */
export const deviceArtwork: Partial<Record<Kind, DeviceArtwork>> = {
  // router: { src: '/devices/router.svg', x: -48, y: -75, width: 96, height: 100 },
};
