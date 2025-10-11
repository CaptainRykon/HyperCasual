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

// ✅ Wagmi + Celo config
export const config = createConfig({
    chains: [base, optimism, mainnet, degen, unichain, celo],
    transports: {
        [base.id]: http(),
        [optimism.id]: http(),
        [mainnet.id]: http(),
        [degen.id]: http(),
        [unichain.id]: http(),
        [celo.id]: http("https://forno.celo.org"), // ✅ Celo RPC endpoint
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

// ✅ Optional: auto-connect Coinbase Wallet if inside Coinbase app
function useCoinbaseWalletAutoConnect() {
    const [isCoinbaseWallet, setIsCoinbaseWallet] = useState(false);
    const { connect, connectors } = useConnect();
    const { isConnected } = useAccount();

    useEffect(() => {
        const checkCoinbaseWallet = () => {
            const isInCoinbaseWallet =
                window.ethereum?.isCoinbaseWallet ||
                window.ethereum?.isCoinbaseWalletExtension ||
                window.ethereum?.isCoinbaseWalletBrowser;
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
            connect({ connector: connectors[1] }); // Coinbase connector
        }
    }, [isCoinbaseWallet, isConnected, connect, connectors]);
}

function CoinbaseWalletAutoConnect({ children }: { children: React.ReactNode }) {
    useCoinbaseWalletAutoConnect();
    return <>{children}</>;
}

export default function Provider({ children }: { children: React.ReactNode }) {
    return (
        <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
                <CoinbaseWalletAutoConnect>{children}</CoinbaseWalletAutoConnect>
            </QueryClientProvider>
        </WagmiProvider>
    );
}
