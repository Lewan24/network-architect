import type { Kind } from '../model/networkTypes';

/** Diagram proportions, deliberately compressed so small hardware stays recognizable.
 * Apply only on the canvas: library thumbnails retain their shared framing.
 */
export const deviceCanvasScale: Record<Kind, number> = {
  rack: 1.3,
  server: 0.9,
  dns: 0.9,
  radius: 0.9,
  workstation: 0.8,
  ups: 0.8,
  printer: 0.75,
  gateway: 0.8,
  router: 0.75,
  firewall: 0.8,
  switch: 0.8,
  'switch-l3': 0.8,
  'switch-unmanaged': 0.6,
  nvr: 0.7,
  laptop: 0.65,
  'mini-server': 0.6,
  accesspoint: 0.45,
  camera: 0.45,
  'mobile-phone': 0.4,
  iot: 0.4,
  vm: 0.65,
  internet: 1,
};
