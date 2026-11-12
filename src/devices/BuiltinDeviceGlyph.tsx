import type { Kind } from '../model/network';
// Vector geometry keeps the isometric objects sharp at every canvas zoom level.
export function BuiltinDeviceGlyph({ kind, color = '#839bbf' }: { kind: Kind; color?: string }) {
  if (kind === 'radius')
    return (
      <g>
        <BuiltinDeviceGlyph kind="server" color={color} />
        <g transform="translate(24 -24)">
          <path
            d="M-17-21 0-27 17-21v18C17 8 0 17 0 17S-17 8-17-3Z"
            fill="#edf0fb"
            stroke="#6d7199"
            strokeWidth="2"
          />
          <circle cy="-9" r="5" fill="none" stroke="#6d7199" strokeWidth="2" />
          <path d="M-9 7c0-10 18-10 18 0" fill="none" stroke="#6d7199" strokeWidth="2" />
        </g>
      </g>
    );
  if (kind === 'internet')
    return (
      <g stroke="#8c9aaa" strokeWidth="1.5" fill="white">
        <path d="M-36 2C-57-2-50-25-32-25C-30-48 4-52 13-31C36-37 51-17 37-3L9 13Z" />
        <path d="m-27-8 22 12 29-17M-5 4v-23m-13-9 13 9 17-10" fill="none" stroke="#b2bece" />
      </g>
    );
  if (kind === 'mobile-phone')
    return (
      <g stroke={color} strokeWidth="3">
        <ellipse cy="16" rx="30" ry="9" fill="#273a55" opacity=".065" stroke="none" />
        <path
          d="M-22-57 14-77Q20-80 20-72V-5Q20 1 15 4L-20 24Q-26 27-26 19V-48Q-26-54-22-57Z"
          fill={color}
        />
        <path d="M-20-50 14-69V-7L-20 12Z" fill="#b7e7fa" stroke="none" />
        <path d="m-9-61 11-6" stroke="#eaf6ff" strokeWidth="2" />
        <circle cx="-3" cy="12" r="2" fill="#eaf6ff" stroke="none" />
      </g>
    );
  const tall = kind === 'server' || kind === 'dns';
  const pc = kind === 'workstation';
  const h = tall
    ? 67
    : pc
      ? 35
      : kind === 'firewall' || kind === 'gateway'
        ? 34
        : kind === 'printer' || kind === 'camera'
          ? 30
          : kind === 'vm'
            ? 26
            : 18;
  return (
    <g>
      <ellipse cx="0" cy="18" rx="48" ry="15" fill="#273a55" opacity=".065" />
      <polygon points="-48,0 0,-27 48,0 0,27" fill="#f7f9fc" stroke="#dce2ea" />
      <g transform="translate(0,-5)">
        <polygon points={`-35,0 0,20 0,${20 - h} -35,${-h}`} fill={color} />
        <polygon
          points={`0,20 35,0 35,${-h} 0,${20 - h}`}
          fill={color}
          style={{ filter: 'brightness(.83)' }}
        />
        <polygon
          points={`-35,${-h} 0,${-20 - h} 35,${-h} 0,${20 - h}`}
          fill={color}
          style={{ filter: 'brightness(1.2)' }}
          stroke="white"
          strokeOpacity=".4"
        />
        {kind.startsWith('switch') || kind === 'router' ? (
          <>
            <path
              d={`M-25 ${3 - h}l16 9m-16-4 16 9`}
              stroke="white"
              opacity=".75"
              strokeWidth="2"
            />
            {[6, 13, 20, 27].map((x) => (
              <path key={x} d={`M${x} ${15 - x * 0.57}v-5`} stroke="#c5e9da" strokeWidth="3" />
            ))}
            {(kind === 'router' || kind === 'switch-l3') && (
              <path
                d={`M-13 ${-h - 4}l13-7 13 7M0 ${-h - 11}v15m-9-5 9 5 9-5`}
                fill="none"
                stroke="white"
                strokeWidth="2"
              />
            )}
          </>
        ) : null}
        <>
          {kind === 'camera' && (
            <g>
              <ellipse
                cx="18"
                cy="-10"
                rx="12"
                ry="9"
                transform="rotate(-30 18 -10)"
                fill="#627080"
                stroke="#dfe5ed"
                strokeWidth="3"
              />
              <ellipse
                cx="18"
                cy="-10"
                rx="5"
                ry="4"
                transform="rotate(-30 18 -10)"
                fill="#a9c4d4"
              />
              <path d="m-10 13 0 12m-8-5 16 9" fill="none" stroke="#8b96a8" strokeWidth="4" />
            </g>
          )}
          {kind === 'dns' && (
            <text x="5" y="-35" fill="#eaf1ff" fontSize="8" transform="rotate(-30 5 -35)">
              DNS
            </text>
          )}
        </>
        {kind === 'vm' && (
          <g stroke="#eee9ff" fill="none" strokeWidth="1.5">
            <path d="m-21-25 16-9 16 9-16 9Zm0 0v12l16 9 16-9v-12M-5-16v12" />
          </g>
        )}
        {kind === 'printer' && (
          <>
            <polygon points="-18,-33 -18,-51 13,-33 13,-15" fill="#f4f6fb" stroke="#d4dae5" />
            <path d="m-12-39 19 11m-19-5 19 11M-27-9l20 11" stroke="#9ba6b9" strokeWidth="2" />
            <circle cx="20" cy="-8" r="2" fill="#d2eddc" />
          </>
        )}
        {tall && (
          <>
            {[0, 1, 2, 3].map((i) => (
              <g key={i}>
                <path d={`M-29 ${-h + 13 + i * 12}l23 13`} stroke="#d6e2f2" strokeWidth="4" />
                <circle cx="-25" cy={-h + 14 + i * 12} r="1.4" fill="#bcf2db" />
              </g>
            ))}
            <path d="m8 4 17-10m-17 5 17-10" stroke="#bbcadd" strokeWidth="2" />
          </>
        )}
        {(kind === 'firewall' || kind === 'gateway') && (
          <g stroke="#f8d8bd" strokeWidth="1.6">
            <path d="M-30-26-5-12m-25-4L-5-2m-18-21v9m10-3v10" />
            <path d="m8-9 19-11m-19 21 19-11m-12-5v10" />
          </g>
        )}
        {pc && (
          <>
            <polygon points="-30,-36 -2,-20 -2,-1 -30,-17" fill="#dfebf6" stroke="#c5d6e6" />
            <polygon points="-26,-31 -6,-19 -6,-7 -26,-19" fill="#a8c6dc" />
            <path d="m-15-7 1 17m-9-1 18 10" stroke="#8190a6" strokeWidth="3" />
          </>
        )}
        {kind === 'accesspoint' && (
          <g fill="none" stroke="#e8dff1" strokeWidth="2">
            <path d="M-17-19q17-19 34 0M-11-15q11-13 22 0M-5-11q5-6 10 0" />
            <circle cy="-7" r="2" fill="white" />
          </g>
        )}
      </g>
    </g>
  );
}
