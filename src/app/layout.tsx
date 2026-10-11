import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'DTI2IRL — Your DTI fit, IRL.', description: 'Screenshot it. Shop it. Wear it. Turn your in-game outfit into a real-world wardrobe with editable garment matching and a virtual pose studio.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><a className="skip-link" href="#studio">Skip to outfit studio</a>{children}</body></html>; }
