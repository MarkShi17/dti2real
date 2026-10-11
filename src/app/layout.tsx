import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/bricolage-grotesque/opsz.css';
import './globals.css';
export const metadata: Metadata = { title: 'DTI2IRL — Your DTI fit, IRL.', description: 'Turn a Dress to Impress screenshot into a real outfit: find matching pieces to shop, then try the look on a model or your own photo.' };
export const viewport: Viewport = { colorScheme: 'light dark', themeColor: [{ media: '(prefers-color-scheme: light)', color: '#f7f6fb' }, { media: '(prefers-color-scheme: dark)', color: '#121019' }] };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><a className="skip-link" href="#studio">Skip to outfit studio</a>{children}</body></html>; }
