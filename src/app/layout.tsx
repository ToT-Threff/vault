import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Kingdom Vault — vault.ptolemy.live',
  description: 'The sovereign nervous system of the Ptolemy Kingdom. One unified archive for every word, memory, file, and interaction across all Wardens and all projects.',
  metadataBase: new URL('https://vault.ptolemy.live'),
  openGraph: {
    title: 'Kingdom Vault',
    description: 'Ptolemy Kingdom — archival intelligence, warden memory, and master console.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
