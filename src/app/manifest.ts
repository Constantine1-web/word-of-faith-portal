import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Word of Faith Schools Portal',
    short_name: 'WOF Portal',
    description: 'Word of Faith Schools Student and Parent Portal',
    start_url: '/portal/dashboard',
    display: 'standalone',
    background_color: '#003322',
    theme_color: '#14532D',
    icons: [
      {
        src: '/icons/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
