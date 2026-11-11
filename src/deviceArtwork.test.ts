import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { DeviceGlyph } from './DeviceGlyph';
import { deviceArtwork } from './deviceArtwork';

afterEach(() => {
  delete deviceArtwork.router;
});

describe('device artwork registry', () => {
  it('keeps the existing vector drawing when no custom artwork is configured', () => {
    const markup = renderToStaticMarkup(createElement(DeviceGlyph, { kind: 'router' }));
    expect(markup).toContain('<polygon');
    expect(markup).not.toContain('<image');
  });
  it('renders a registered image in the same device coordinate system', () => {
    deviceArtwork.router = { src: '/devices/router.svg', x: -48, y: -75, width: 96, height: 100 };
    const markup = renderToStaticMarkup(createElement(DeviceGlyph, { kind: 'router' }));
    expect(markup).toContain('href="/devices/router.svg"');
    expect(markup).toContain('x="-48"');
    expect(markup).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(markup).not.toContain('<polygon');
  });
});
