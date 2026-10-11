'use client';
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="error-page"><h1>The studio needs a refresh.</h1><p>Your private session is still saved locally. Retry to reopen it.</p><button className="button primary" onClick={reset}>Reopen studio</button></main>; }
