import type {Metadata} from 'next';
import './globals.css'; // Global styles

export const metadata: Metadata = {
  title: 'Personal Gemini Journal',
  description: 'A private AI-powered journal combining familiar chat interactions with longitudinal personal reflection.',
  openGraph: {
    title: 'Personal Gemini Journal',
    description: 'A private AI-powered journal combining familiar chat interactions with longitudinal personal reflection.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Personal Gemini Journal',
    description: 'A private AI-powered journal combining familiar chat interactions with longitudinal personal reflection.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
