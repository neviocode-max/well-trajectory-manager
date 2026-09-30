import type { SVGProps } from 'react';
import type { ModuleId } from '../../app/navigation';

type IconName = ModuleId | 'menu' | 'sun' | 'moon' | 'check' | 'info' | 'warning' | 'error' | 'close' | 'database';

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 18, ...props }: IconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
    ...props,
  };

  switch (name) {
    case 'dashboard':
      return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>;
    case 'calculator':
      return <svg {...common}><path d="M4 7h14"/><path d="m15 4 3 3-3 3"/><path d="M20 17H6"/><path d="m9 14-3 3 3 3"/></svg>;
    case 'database':
      return <svg {...common}><ellipse cx="12" cy="5" rx="7.5" ry="3"/><path d="M4.5 5v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V5"/><path d="M4.5 11v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6"/></svg>;
    case 'splitter':
      return <svg {...common}><path d="M5 4v5c0 2 1 3 3 3h8c2 0 3 1 3 3v5"/><path d="M5 20v-5c0-2 1-3 3-3"/><path d="m16 17 3 3 3-3"/><path d="m2 17 3 3 3-3"/></svg>;
    case 'studio':
      return <svg {...common}><path d="m4 17 5-8 4 5 3-4 4 7"/><path d="M3 20h18"/><path d="M4 17V5h16v12"/></svg>;
    case 'distance':
      return <svg {...common}><path d="M4 12h16"/><path d="m7 9-3 3 3 3"/><path d="m17 9 3 3-3 3"/><path d="M8 5h8"/><path d="M8 19h8"/></svg>;
    case 'coordinate':
      return <svg {...common}><circle cx="12" cy="12" r="8"/><path d="M12 2v4"/><path d="M12 18v4"/><path d="M2 12h4"/><path d="M18 12h4"/><circle cx="12" cy="12" r="2"/></svg>;
    case 'menu':
      return <svg {...common}><path d="M4 7h16M4 12h16M4 17h16"/></svg>;
    case 'sun':
      return <svg {...common}><circle cx="12" cy="12" r="3.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>;
    case 'moon':
      return <svg {...common}><path d="M20 15.4A8 8 0 0 1 8.6 4 8.2 8.2 0 1 0 20 15.4Z"/></svg>;
    case 'check':
      return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="m8 12 2.6 2.6L16.5 9"/></svg>;
    case 'info':
      return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg>;
    case 'warning':
      return <svg {...common}><path d="M10.3 3.8 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>;
    case 'error':
      return <svg {...common}><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/></svg>;
    case 'close':
      return <svg {...common}><path d="m6 6 12 12M18 6 6 18"/></svg>;
    default:
      return <svg {...common}><ellipse cx="12" cy="5" rx="7.5" ry="3"/><path d="M4.5 5v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V5"/></svg>;
  }
}
