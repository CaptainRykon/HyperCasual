"use client";

import { useEffect, useRef } from "react";
import sdk from "@farcaster/frame-sdk";
import { ALLOWED_FIDS } from "../utils/AllowedFids";
import { requestPayment } from "@daimo/pay";

export default function App() {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const userInfoRef = useRef({ username: "Guest", pfpUrl: "", fid: "" });

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

                    iw.postMessage({
                        type: "FARCASTER_USER_INFO",
                        payload: { username, pfpUrl },
                    }, "*");

                    iw.postMessage({
                        type: "UNITY_METHOD_CALL",
                        method: "SetFarcasterFID",
                        args: [fid],
                    }, "*");

                    const isAllowed = ALLOWED_FIDS.includes(Number(fid));
                    iw.postMessage({
                        type: "UNITY_METHOD_CALL",
                        method: "SetFidGateState",
                        args: [isAllowed ? "1" : "0"],
                    }, "*");

                    console.log("✅ Posted info to Unity →", { username, fid, isAllowed });
                };

                iframeRef.current?.addEventListener("load", postToUnity);

                window.addEventListener("message", async (event) => {
                    const { type, action, amount } = event.data || {};
                    if (type !== "frame-action") return;

                    switch (action) {
                        case "get-user-context":
                            postToUnity();
                            break;

                        case "request-payment":
                            console.log("💸 Unity requested payment:", amount);

                            try {
                                await requestPayment({
                                    chainId: 8453, // Base Mainnet
                                    recipient: "0xE51f63637c549244d0A8E11ac7E6C86a1E9E0670", // Your wallet
                                    amount: amount || "2.00",
                                    token: "USDC",
                                    onSuccess: () => {
                                        const iw = iframeRef.current?.contentWindow;
                                        if (!iw) return;
                                        iw.postMessage({
                                            type: "UNITY_METHOD_CALL",
                                            method: "SetPaymentSuccess",
                                            args: ["1"],
                                        }, "*");
                                        console.log("✅ Payment success sent to Unity");
                                    },
                                    onError: (err) => {
                                        console.error("❌ Payment failed:", err);
                                    },
                                });
                            } catch (err) {
                                console.error("❌ Error during payment flow:", err);
                            }

                            break;

                        // You can add more frame-actions here
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
