import type { Metadata } from 'next';
import { Nunito_Sans } from 'next/font/google';
import './globals.css';

const nunitoSans = Nunito_Sans({
  subsets: ['latin'],
  weight: ['200', '300', '400', '500', '600', '700', '800', '900'],
  variable: '--font-nunito-sans',
});

export const metadata: Metadata = {
  title: "Don't Forget",
  description: 'Assistant de recommandations de produits pour voyageurs',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${nunitoSans.variable} font-nunito`}>{children}</body>
    </html>
  );
}
