import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { DeviceGlyph } from '../devices/DeviceGlyph';
import { deviceArtwork } from '../devices/deviceArtwork';

const original = deviceArtwork.router;
afterEach(() => {
  deviceArtwork.router = original;
});

describe('device artwork registry', () => {
  it('keeps the vector drawing when no custom artwork is configured', () => {
    delete deviceArtwork.router;
    const markup = renderToStaticMarkup(createElement(DeviceGlyph, { kind: 'router' }));
    expect(markup).toContain('<polygon');
    expect(markup).not.toContain('<image');
  });
  it.each(['svg', 'png', 'webp'])(
    'renders %s artwork in the shared coordinate system',
    (extension) => {
      deviceArtwork.router = {
        src: `/devices/router.${extension}`,
        x: -48,
        y: -75,
        width: 96,
        height: 100,
      };
      const markup = renderToStaticMarkup(createElement(DeviceGlyph, { kind: 'router' }));
      expect(markup).toContain(`href="/devices/router.${extension}"`);
      expect(markup).toContain('x="-48"');
      expect(markup).toContain('preserveAspectRatio="xMidYMid meet"');
      expect(markup).not.toContain('<polygon');
      // A second kind retains its independently configured PNG artwork.
      expect(renderToStaticMarkup(createElement(DeviceGlyph, { kind: 'mobile-phone' }))).toContain(
        'href="/devices/mobile-phone.png"',
      );
    },
  );
});
