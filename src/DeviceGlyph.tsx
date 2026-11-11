import { BuiltinDeviceGlyph } from './BuiltinDeviceGlyph';
import { deviceArtwork } from './deviceArtwork';
import type { Kind } from './networkTypes';

type Props = { kind: Kind; color?: string };

/** Shared rendering entry point for built-in vectors and custom image assets. */
export function DeviceGlyph({ kind, color }: Props) {
  const artwork = deviceArtwork[kind];
  if (artwork) {
    return (
      <image
        href={artwork.src}
        x={artwork.x}
        y={artwork.y}
        width={artwork.width}
        height={artwork.height}
        preserveAspectRatio="xMidYMid meet"
      />
    );
  }
  return <BuiltinDeviceGlyph kind={kind} color={color} />;
}
