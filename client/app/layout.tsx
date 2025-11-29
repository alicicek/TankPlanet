import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'io game',
  description: 'Fast-paced Babylon.js arena on Next.js',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
