import type { Kind } from '../model/networkTypes';

export type DeviceArtwork = {
  /** File in public/: SVG, PNG and WebP may be mixed in this registry. */
  src: string;
  /** Canvas units; compensate for transparent margins so the visible base is near (0, 12). */
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Shared framing for library thumbnails and dialog previews. */
export const DEVICE_VIEW_BOX = '-65 -95 130 130';

/** Per-file calibration, including transparent padding and the aspect ratio of each supplied PNG.
 * Missing entries use built-in vectors. Paths may freely mix SVG and raster formats.
 */
export const deviceArtwork: Partial<Record<Kind, DeviceArtwork>> = {
  internet: { src: '/devices/internet.png', x: -58.74, y: -89.52, width: 119.09, height: 119.09 },
  gateway: {
    src: '/devices/router-firewall.png',
    x: -64.02,
    y: -78.68,
    width: 130.65,
    height: 97.98,
  },
  router: { src: '/devices/router.png', x: -63.97, y: -79.92, width: 130.37, height: 97.77 },
  firewall: { src: '/devices/firewall.png', x: -52.84, y: -84.52, width: 106.36, height: 106.36 },
  switch: { src: '/devices/switch-l2.png', x: -62.96, y: -70.09, width: 125.91, height: 94.43 },
  'switch-l3': {
    src: '/devices/switch-l3.png',
    x: -64.07,
    y: -71.63,
    width: 128.14,
    height: 96.11,
  },
  'switch-unmanaged': {
    src: '/devices/switch-unmanaged.png',
    x: -66.74,
    y: -70.38,
    width: 133.57,
    height: 100.18,
  },
  server: { src: '/devices/server.png', x: -52.46, y: -88.55, width: 105.25, height: 105.25 },
  workstation: { src: '/devices/pc.png', x: -68.81, y: -85.17, width: 136.87, height: 102.65 },
  accesspoint: {
    src: '/devices/access-point.png',
    x: -54.05,
    y: -89.0,
    width: 108.53,
    height: 108.53,
  },
  vm: { src: '/devices/virtual-machine.png', x: -51.72, y: -84.57, width: 103.6, height: 103.6 },
  printer: { src: '/devices/printer.png', x: -54.89, y: -86.93, width: 109.6, height: 109.6 },
  dns: { src: '/devices/dns.png', x: -55.58, y: -89.45, width: 110.72, height: 110.72 },
  camera: { src: '/devices/ip-camera.png', x: -63.7, y: -74.94, width: 124.89, height: 93.67 },
  'mobile-phone': {
    src: '/devices/mobile-phone.png',
    x: -39.05,
    y: -87.21,
    width: 78.53,
    height: 104.7,
  },
};
