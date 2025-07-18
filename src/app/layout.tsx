import type { Metadata } from 'next';

import '~/app/globals.css';
import { Providers } from '~/app/providers';
import { APP_NAME, APP_DESCRIPTION } from '~/lib/constants';

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_DESCRIPTION,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const sponsorSigner = process.env.SPONSOR_SIGNER === 'true';
  const hasSeedPhrase = Boolean(process.env.SEED_PHRASE);
  const shouldUseSession = sponsorSigner || hasSeedPhrase;

  let session: unknown = null;

  if (shouldUseSession) {
    try {
      // @ts-expect-error - module might not exist in all templates
      const authModule = eval('require("~/auth")');
      session = await authModule.getSession();
    } catch {
      console.warn('Failed to get session'); // ✅ Removed unused `error`
    }
  }

  return (
    <html lang="en">
      <body>
        <Providers session={session} shouldUseSession={shouldUseSession}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
