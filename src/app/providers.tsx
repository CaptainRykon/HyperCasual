'use client';

import dynamic from 'next/dynamic';
import { MiniAppProvider } from '@neynar/react';
import { SafeFarcasterSolanaProvider } from '~/components/providers/SafeFarcasterSolanaProvider';
import { ANALYTICS_ENABLED } from '~/lib/constants';
import { ReactNode } from 'react';

const WagmiProvider = dynamic(
  () => import('~/components/providers/WagmiProvider'),
  {
    ssr: false,
  }
);

interface ProvidersProps {
  session: unknown | null; // ✅ replaces `any`
  children: ReactNode;
  shouldUseSession?: boolean;
}

export function Providers({
  session,
  children,
  shouldUseSession = false,
}: ProvidersProps) {
  const solanaEndpoint =
    process.env.SOLANA_RPC_ENDPOINT || 'https://solana-rpc.publicnode.com';

  if (shouldUseSession) {
    const AuthWrapper = dynamic<{ children: ReactNode }>(
      () =>
        Promise.resolve().then(() => {
          try {
            // @ts-expect-error - dynamic imports of optional modules
            const nextAuth = eval('require("next-auth/react")');
            // @ts-expect-error - dynamic imports of optional modules
            const authKit = eval('require("@farcaster/auth-kit")');

            const WrappedComponent = ({ children }: { children: ReactNode }) => (
              <nextAuth.SessionProvider session={session}>
                <authKit.AuthKitProvider config={{}}>
                  {children}
                </authKit.AuthKitProvider>
              </nextAuth.SessionProvider>
            );

            WrappedComponent.displayName = 'WrappedComponent'; // ✅ Fix for missing display name
            return WrappedComponent;
          } catch {
            const Fallback = ({ children }: { children: ReactNode }) => <>{children}</>;
            Fallback.displayName = 'AuthWrapperFallback'; // ✅ Fix for display name
            return Fallback;
          }
        }),
      { ssr: false }
    );

    return (
      <WagmiProvider>
        <MiniAppProvider
          analyticsEnabled={ANALYTICS_ENABLED}
          backButtonEnabled={true}
        >
          <SafeFarcasterSolanaProvider endpoint={solanaEndpoint}>
            <AuthWrapper>{children}</AuthWrapper>
          </SafeFarcasterSolanaProvider>
        </MiniAppProvider>
      </WagmiProvider>
    );
  }

  return (
    <WagmiProvider>
      <MiniAppProvider
        analyticsEnabled={ANALYTICS_ENABLED}
        backButtonEnabled={true}
      >
        <SafeFarcasterSolanaProvider endpoint={solanaEndpoint}>
          {children}
        </SafeFarcasterSolanaProvider>
      </MiniAppProvider>
    </WagmiProvider>
  );
}
