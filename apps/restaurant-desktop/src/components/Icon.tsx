import type { SVGProps } from 'react';

const paths: Record<string, string> = {
  dashboard: 'M3 4h8v7H3zM13 4h8v5h-8zM13 11h8v9h-8zM3 13h8v7H3z',
  orders: 'M7 4h10l3 4v13H4V8zM4 8h16M9 12h6m-6 4h4M9 4V2m6 2V2',
  accept: 'M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20zM8 12.5l3 3 5.5-6',
  cooking: 'M4 11h16v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM3 11h18M9 6c0-1.5 1-2.5 1-3.5M14 6c0-1.5 1-2.5 1-3.5M7 21h10',
  courier: 'M5 17a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm14 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8 14h4l3-6h3m-5 6-2-4H7',
  ownCourier: 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21v-2a7 7 0 0 1 11-5.8M17 15l2 2 4-4',
  onDemandCourier: 'M12 3a9 9 0 0 1 9 9M12 7a5 5 0 0 1 5 5M5 18h10l2-5H7zM8 18a2 2 0 1 1-4 0m13 0a2 2 0 1 1-4 0',
  courierSearch: 'M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15zM21 21l-5.2-5.2M10.5 8v5M8 10.5h5',
  assignCourier: 'M15 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM3 21v-2a7 7 0 0 1 11-5.5M18 14v7m-3.5-3.5h7',
  payment: 'M3 6h18v12H3zM3 10h18M7 14h4',
  receipt: 'M5 3h14v19l-3-2-4 2-4-2-3 2zM9 8h6m-6 4h6m-6 4h4',
  excel: 'M5 3h10l4 4v14H5zM15 3v4h4M9 11l6 6m0-6-6 6',
  csv: 'M5 3h10l4 4v14H5zM15 3v4h4M8 13h8M8 17h5',
  importFile: 'M4 15v5h16v-5M12 3v12m-4-4 4 4 4-4',
  exportFile: 'M4 15v5h16v-5M12 15V3m-4 4 4-4 4 4',
  statistics: 'M4 20h16M7 16v-5m5 5V6m5 10v-8',
  notifications: 'M5 17h14l-2-3V9a5 5 0 0 0-10 0v5zM10 21h4M12 4V2',
  map: 'm3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15m6-12v15',
  settings: 'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  restaurant: 'M4 10v11h16V10M3 10l2-7h14l2 7M3 10a3 3 0 0 0 5 2 3 3 0 0 0 4 0 3 3 0 0 0 4 0 3 3 0 0 0 5-2M9 21v-6h6v6',
  menu: 'M4 5h16v14H4zM8 9h8m-8 4h8m-8 4h5',
  dish: 'M3 17h18M5 17a7 7 0 0 1 14 0M12 10V7m-2 0h4M3 21h18',
  video: 'M3 5h13v14H3zM16 10l5-4v12l-5-4',
  user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a8 7 0 0 1 16 0v2',
  location: 'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0M14.5 10a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0',
  clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 7v5l3 2',
  check: 'm4 12 5 5L20 6',
  close: 'm5 5 14 14M5 19 19 5',
  plus: 'M12 4v16M4 12h16',
  edit: 'm15 4 5 5M4 15 16 3l5 5L9 20l-6 1z',
  trash: 'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
  refresh: 'M20 7v5h-5M4 17v-5h5M6.1 7a7 7 0 0 1 11.6-2L20 8M4 16l2.3 3a7 7 0 0 0 11.6-2',
  sun: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1',
  moon: 'M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12',
  logout: 'M9 3H3v18h6M9 12h12m-5-5 5 5-5 5',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  eyeOff: 'm3 3 18 18M10.6 5.1A12 12 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.7M6.3 6.3A18 18 0 0 0 2 12s3.5 7 10 7a12 12 0 0 0 5.7-1.7M9.9 9.9a3 3 0 0 0 4.2 4.2',
  search: 'M20.5 20.5 16 16M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0',
  chevron: 'm9 5 7 7-7 7',
  back: 'm14 5-7 7 7 7',
  star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L2 9.6l6.2-.9z',
  cash: 'M2 6h20v12H2zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0M5 10v4m14-4v4',
  delivery: 'M2 5h12v13H2zM14 10h4l4 5v3h-8M8 18a2 2 0 1 1-4 0m16 0a2 2 0 1 1-4 0',
  server: 'M4 4h16v6H4zM4 14h16v6H4zM8 7h.01M8 17h.01',
  upload: 'M12 16V3m-5 5 5-5 5 5M3 15v6h18v-6',
  bicycle: 'M9 5h4m-2 0 4 12M5 17l6-9h6l3 9M5 17h10M17 5h3l1 3M9 17a4 4 0 1 1-8 0 4 4 0 0 1 8 0M23 17a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  sparkles: 'M12 3l1.8 4.6L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.9zM19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8zM5 17l.6 1.4L7 19l-1.4.6L5 21l-.6-1.4L3 19l1.4-.6z',
  bot: 'M12 3v3M5 9a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3zM2 13h3M19 13h3M9.5 12.5h.01M14.5 12.5h.01M9 16.5h6',
  send: 'M21 3 10 14M21 3l-6.5 18-3.5-7-7-3.5z',
  thumbUp: 'M7 10v11H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3zm0 0 3.7-6.3A1.6 1.6 0 0 1 13.7 4.5V9h5.4a2 2 0 0 1 2 2.3l-1.1 7.2a2 2 0 0 1-2 1.5H7',
  thumbDown: 'M17 14V3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-3zm0 0-3.7 6.3a1.6 1.6 0 0 1-3-.8V15H4.9a2 2 0 0 1-2-2.3L4 5.5A2 2 0 0 1 6 4h11',
  pin: 'M12 17v5M9 4h6l-1 5 3 3v2H7v-2l3-3z',
  sliders: 'M4 6h4m4 0h8M8 4v4M4 12h10m4 0h2M14 10v4M4 18h6m4 0h6M10 16v4',
  zap: 'M13 2 4 14h7l-1 8 9-12h-7z',
  expand: 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7',
  minimize: 'M4 14h6v6M20 10h-6V4M10 14l-7 7M14 10l7-7',
  chevronDown: 'm5 9 7 7 7-7',
};

export type IconName = keyof typeof paths;

export function Icon({
  name,
  size = 20,
  filled = false,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName; size?: number; filled?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
