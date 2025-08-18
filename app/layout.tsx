import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: "Don't Forget",
  description: 'Assistant de recommandations de produits pour voyageurs',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
