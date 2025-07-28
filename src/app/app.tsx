"use client";

import { useEffect, useRef } from "react";
import sdk from "@farcaster/frame-sdk";
import { ALLOWED_FIDS } from "../utils/AllowedFids";
import { parseUnits } from "ethers";
import { createWalletClient, custom, encodeFunctionData } from "viem";
import { base } from "viem/chains";
import { useAccount } from "wagmi";

type FarcasterUserInfo = {
    username: string;
    pfpUrl: string;
    fid: string;
};

type UnityMessage =
    | {
        type: "FARCASTER_USER_INFO";
        payload: {
            username: string;
            pfpUrl: string;
        };
    }
    | {
        type: "UNITY_METHOD_CALL";
        method: string;
        args: string[];
    };

type FrameActionMessage = {
    type: "frame-action";
    action: "get-user-context" | "request-payment";
};

type FrameTransactionMessage = {
    type: "farcaster:frame-transaction";
    data?: unknown;
};

export default function App() {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const userInfoRef = useRef<FarcasterUserInfo>({
        username: "Guest",
        pfpUrl: "",
        fid: "",
    });

    const { address } = useAccount();

    useEffect(() => {
        const init = async () => {
            try {
                await sdk.actions.ready();

                const context = await sdk.context;
                const user = context?.user || {};

                userInfoRef.current = {
                    username: user.username || "Guest",
                    pfpUrl: user.pfpUrl || "",
                    fid: user.fid?.toString() || "",
                };

                const postToUnity = () => {
                    const iw = iframeRef.current?.contentWindow;
                    if (!iw) return;

                    const { username, pfpUrl, fid } = userInfoRef.current;
                    const isAllowed = ALLOWED_FIDS.includes(Number(fid));

                    const messages: UnityMessage[] = [
                        {
                            type: "FARCASTER_USER_INFO",
                            payload: { username, pfpUrl },
                        },
                        {
                            type: "UNITY_METHOD_CALL",
                            method: "SetFarcasterFID",
                            args: [fid],
                        },
                        {
                            type: "UNITY_METHOD_CALL",
                            method: "SetFidGateState",
                            args: [isAllowed ? "1" : "0"],
                        },
                    ];

                    messages.forEach((msg) => iw.postMessage(msg, "*"));
                    console.log("✅ Posted info to Unity →", { username, fid, isAllowed });
                };

                iframeRef.current?.addEventListener("load", postToUnity);

                // Unity -> React
                window.addEventListener(
                    "message",
                    async (event: MessageEvent<FrameActionMessage>) => {
                        const { type, action } = event.data || {};
                        if (type !== "frame-action") return;

                        switch (action) {
                            case "get-user-context":
                                postToUnity();
                                break;

                            case "request-payment":
                                console.log("💸 Unity requested locked 2 USDC payment");

                                const recipient = "0xE51f63637c549244d0A8E11ac7E6C86a1E9E0670";
                                const usdcContract = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

                                const data = encodeFunctionData({
                                    abi: [
                                        {
                                            name: "transfer",
                                            type: "function",
                                            stateMutability: "nonpayable",
                                            inputs: [
                                                { name: "to", type: "address" },
                                                { name: "amount", type: "uint256" },
                                            ],
                                            outputs: [{ name: "", type: "bool" }],
                                        },
                                    ],
                                    functionName: "transfer",
                                    args: [recipient, parseUnits("2", 6)],
                                });

                                const client = createWalletClient({
                                    chain: base,
                                    transport: custom((window).ethereum),
                                });

                                try {
                                    const txHash = await client.sendTransaction({
                                        to: usdcContract,
                                        data,
                                        value: 0n,
                                        account: address!,
                                    });

                                    console.log("⏳ Waiting for transaction:", txHash);

                                    iframeRef.current?.contentWindow?.postMessage(
                                        { type: "PaymentSuccess" },
                                        "*"
                                    );

                                    console.log("✅ Payment success sent to Unity");
                                } catch (err) {
                                    console.error("❌ Payment failed:", err);
                                }

                                break;
                        }
                    }
                );

                // Optional: Listen to Frame Wallet confirmation
                window.addEventListener(
                    "message",
                    (event: MessageEvent<FrameTransactionMessage>) => {
                        if (event.data?.type === "farcaster:frame-transaction") {
                            console.log("✅ Frame Wallet transaction confirmed");
                            iframeRef.current?.contentWindow?.postMessage(
                                { type: "PaymentSuccess" },
                                "*"
                            );
                        }
                    }
                );
            } catch (err) {
                console.error("❌ Error initializing bridge:", err);
            }
        };

        init();
    }, [address]);

    return (
        <div style={{ width: "100vw", height: "100vh", overflow: "hidden" }}>
            <iframe
                ref={iframeRef}
                src="/BridgeWebgl/index.html"
                style={{ width: "100%", height: "100%", border: "none" }}
                allowFullScreen
            />
        </div>
    );
}
