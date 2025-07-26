"use client";

import { useEffect, useRef } from "react";
import sdk from "@farcaster/frame-sdk";
import { ALLOWED_FIDS } from "../utils/AllowedFids";

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
    amount?: string;
};

export default function App() {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const userInfoRef = useRef<FarcasterUserInfo>({
        username: "Guest",
        pfpUrl: "",
        fid: "",
    });

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

                window.addEventListener("message", async (event: MessageEvent<FrameActionMessage>) => {
                    const { type, action, amount } = event.data || {};
                    if (type !== "frame-action") return;

                    switch (action) {
                        case "get-user-context":
                            postToUnity();
                            break;

                        case "request-payment":
                            console.log("💸 Unity requested payment:", amount);
                            try {
                                const { fid } = userInfoRef.current;

                                const result = await sdk.actions.sendToken({
                                    token: "eip155:8453/erc20:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
                                    amount: "2000000", // 2 USDC (6 decimals)
                                    recipientFid: Number(fid),
                                    recipientAddress: "0xE51f63637c549244d0A8E11ac7E6C86a1E9E0670", // Your wallet
                                });

                                if (result.success) {
                                    console.log("✅ Payment complete, tx:", result.send.transaction);
                                    const iw = iframeRef.current?.contentWindow;
                                    iw?.postMessage(
                                        {
                                            type: "UNITY_METHOD_CALL",
                                            method: "SetPaymentSuccess",
                                            args: ["1"],
                                        },
                                        "*"
                                    );
                                } else {
                                    console.error("❌ Payment failed:", result.reason, result.error?.message);
                                }
                            } catch (err) {
                                console.error("❌ Error during payment:", err);
                            }
                            break;
                    }
                });
            } catch (err) {
                console.error("❌ Error initializing bridge:", err);
            }
        };

        init();
    }, []);

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
