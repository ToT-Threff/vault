import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import AuthGate from '@/components/AuthGate';

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
        {/* Font stylesheet — Inter (body), Space Grotesk (headings), JetBrains Mono (code) */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;700&family=JetBrains+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>
        <AuthProvider>
          <AuthGate>{children}</AuthGate>
        </AuthProvider>
      </body>
    </html>
  );
}
