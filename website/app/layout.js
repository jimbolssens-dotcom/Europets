import { Fraunces, Karla } from 'next/font/google';
import './globals.css';
import Nav from './_components/Nav';
import Footer from './_components/Footer';

const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
});

const karla = Karla({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata = {
  title: 'Europets Clinic — Sharjah',
  description:
    'Independent veterinary clinic in Sharjah since 2005 — wellness, dentistry, diagnostics, and surgery for your pets. Book an appointment online.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${karla.variable}`}>
      <body>
        <Nav />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
