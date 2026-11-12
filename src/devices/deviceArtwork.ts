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
  iot: { src: '/devices/iot.png', x: -55.1, y: -84.54, width: 114.31, height: 114.31 },
  laptop: { src: '/devices/laptop.png', x: -60.34, y: -101.25, width: 125.9, height: 125.9 },
  nvr: { src: '/devices/nvr.png', x: -59.25, y: -80.55, width: 118.3, height: 118.3 },
  'mini-server': {
    src: '/devices/mini-server.png',
    x: -67.8,
    y: -105.75,
    width: 135.71,
    height: 135.71,
  },
  ups: { src: '/devices/ups.png', x: -56.12, y: -94.65, width: 111.17, height: 111.17 },
  internet: { src: '/devices/internet.png', x: -58.73, y: -89.42, width: 118.98, height: 118.98 },
  gateway: {
    src: '/devices/router-firewall.png',
    x: -74.45,
    y: -93.46,
    width: 151.94,
    height: 113.96,
  },
  router: { src: '/devices/router.png', x: -73.02, y: -93.04, width: 148.82, height: 111.61 },
  firewall: { src: '/devices/firewall.png', x: -60.02, y: -97.63, width: 120.81, height: 120.81 },
  switch: { src: '/devices/switch-l2.png', x: -62.86, y: -70.02, width: 125.8, height: 94.35 },
  'switch-l3': {
    src: '/devices/switch-l3.png',
    x: -64.07,
    y: -71.63,
    width: 128.14,
    height: 96.11,
  },
  'switch-unmanaged': {
    src: '/devices/switch-unmanaged.png',
    x: -70.86,
    y: -75.46,
    width: 141.82,
    height: 106.37,
  },
  server: { src: '/devices/rack-server.png', x: -56.59, y: -74.19, width: 113.18, height: 113.18 },
  rack: { src: '/devices/rack.png', x: -55.7, y: -94.86, width: 111.76, height: 111.76 },
  workstation: { src: '/devices/pc.png', x: -72.39, y: -90.29, width: 144.08, height: 108.06 },
  accesspoint: {
    src: '/devices/access-point.png',
    x: -58.7,
    y: -97.78,
    width: 117.97,
    height: 117.97,
  },
  vm: { src: '/devices/virtual-machine.png', x: -60.13, y: -100.3, width: 120.46, height: 120.46 },
  printer: { src: '/devices/printer.png', x: -61.94, y: -99.75, width: 123.79, height: 123.79 },
  dns: { src: '/devices/dns.png', x: -60.4, y: -98.26, width: 120.23, height: 120.23 },
  radius: { src: '/devices/radius.png', x: -59.02, y: -90.01, width: 114.31, height: 114.31 },
  camera: { src: '/devices/ip-camera.png', x: -66.34, y: -78.48, width: 129.98, height: 97.49 },
  'mobile-phone': {
    src: '/devices/mobile-phone.png',
    x: -41.54,
    y: -93.54,
    width: 83.54,
    height: 111.38,
  },
};
