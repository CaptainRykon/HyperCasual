"use client";

import { createConfig, http, WagmiProvider } from "wagmi";
import { base, degen, mainnet, optimism, unichain, celo } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { farcasterFrame } from "@farcaster/frame-wagmi-connector";
import { coinbaseWallet, metaMask } from "wagmi/connectors";
import { APP_NAME, APP_ICON_URL, APP_URL } from "~/lib/constants";
import { useEffect, useState } from "react";
import { useConnect, useAccount } from "wagmi";
import React from "react";
import type { EthereumProvider } from "@wagmi/core"; // <-- bring in base type

// --------------------------------------------------
// ✅ Type Augmentation for Coinbase Wallet flags
// --------------------------------------------------
declare global {
    interface EthereumProvider {
        isCoinbaseWallet?: boolean;
        isCoinbaseWalletExtension?: boolean;
        isCoinbaseWalletBrowser?: boolean;
    }

    interface Window {
        ethereum?: EthereumProvider;
    }
}

// --------------------------------------------------
// ✅ Custom hook for Coinbase Wallet auto-connection
// --------------------------------------------------
function useCoinbaseWalletAutoConnect() {
    const [isCoinbaseWallet, setIsCoinbaseWallet] = useState(false);
    const { connect, connectors } = useConnect();
    const { isConnected } = useAccount();

    useEffect(() => {
        const checkCoinbaseWallet = () => {
            const provider = window.ethereum as EthereumProvider | undefined;
            const isInCoinbaseWallet =
                provider?.isCoinbaseWallet ||
                provider?.isCoinbaseWalletExtension ||
                provider?.isCoinbaseWalletBrowser;

            setIsCoinbaseWallet(!!isInCoinbaseWallet);
        };

        checkCoinbaseWallet();
        window.addEventListener("ethereum#initialized", checkCoinbaseWallet);

        return () => {
            window.removeEventListener("ethereum#initialized", checkCoinbaseWallet);
        };
    }, []);

    useEffect(() => {
        if (isCoinbaseWallet && !isConnected) {
            const cbwConnector = connectors.find((c) => c.id === "coinbaseWallet");
            if (cbwConnector) {
                connect({ connector: cbwConnector });
            }
        }
    }, [isCoinbaseWallet, isConnected, connect, connectors]);

    return isCoinbaseWallet;
}

// --------------------------------------------------
// ✅ Wagmi config
// --------------------------------------------------
export const config = createConfig({
    chains: [base, optimism, mainnet, degen, unichain, celo],
    transports: {
        [base.id]: http(),
        [optimism.id]: http(),
        [mainnet.id]: http(),
        [degen.id]: http(),
        [unichain.id]: http(),
        [celo.id]: http(),
    },
    connectors: [
        farcasterFrame(),
        coinbaseWallet({
            appName: APP_NAME,
            appLogoUrl: APP_ICON_URL,
            preference: "all",
        }),
        metaMask({
            dappMetadata: {
                name: APP_NAME,
                url: APP_URL,
            },
        }),
    ],
});

const queryClient = new QueryClient();

// --------------------------------------------------
// ✅ Wrapper with Coinbase Wallet auto-connect
// --------------------------------------------------
function CoinbaseWalletAutoConnect({ children }: { children: React.ReactNode }) {
    useCoinbaseWalletAutoConnect();
    return <>{children}</>;
}

// --------------------------------------------------
// ✅ Final Provider
// --------------------------------------------------
export default function Provider({ children }: { children: React.ReactNode }) {
    return (
        <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
                <CoinbaseWalletAutoConnect>{children}</CoinbaseWalletAutoConnect>
            </QueryClientProvider>
        </WagmiProvider>
    );
}
