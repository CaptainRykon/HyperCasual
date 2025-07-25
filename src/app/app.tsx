"use client";

import { useEffect, useRef } from "react";
import sdk from "@farcaster/frame-sdk";
import { ALLOWED_FIDS } from "../utils/AllowedFids";
import Web3 from "web3";

export default function App() {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const userInfoRef = useRef({
        username: "Guest",
        pfpUrl: "",
        fid: "",
    });

    useEffect(() => {
        const initBridge = async () => {
            try {
                await sdk.actions.ready();
                const context = await sdk.context;
                const user = context?.user || {};

                userInfoRef.current = {
                    username: user.username || "Guest",
                    pfpUrl: user.pfpUrl || "",
                    fid: user.fid?.toString() || "",
                };

                const postUserInfoToUnity = () => {
                    const iframe = iframeRef.current;
                    if (!iframe?.contentWindow) return;

                    const { username, pfpUrl, fid } = userInfoRef.current;

                    // Send user info
                    iframe.contentWindow.postMessage({
                        type: "FARCASTER_USER_INFO",
                        payload: { username, pfpUrl },
                    }, "*");

                    // Send FID
                    iframe.contentWindow.postMessage({
                        type: "UNITY_METHOD_CALL",
                        method: "SetFarcasterFID",
                        args: [fid],
                    }, "*");

                    // FID Gate Check
                    const isAllowed = ALLOWED_FIDS.includes(Number(fid));
                    iframe.contentWindow.postMessage({
                        type: "UNITY_METHOD_CALL",
                        method: "SetFidGateState",
                        args: [isAllowed ? "1" : "0"],
                    }, "*");

                    console.log("✅ Posted user info & gate status to Unity:", {
                        username,
                        pfpUrl,
                        fid,
                        isAllowed,
                    });
                };

                if (iframeRef.current) {
                    iframeRef.current.addEventListener("load", postUserInfoToUnity);
                }

                window.addEventListener("message", async (event) => {
                    const { type, action, message, amount } = event.data || {};
                    if (type !== "frame-action") return;

                    switch (action) {
                        case "share-game":
                            sdk.actions.openUrl(`https://warpcast.com/~/compose?text=🎮 Try this awesome game!&embeds[]=https://fargo-sable.vercel.app/`);
                            break;

                        case "share-score":
                            sdk.actions.openUrl(`https://warpcast.com/~/compose?text=🏆 I scored ${message} points! Can you beat me?&embeds[]=https://fargo-sable.vercel.app/`);
                            break;

                        case "get-user-context":
                            console.log("📨 Unity requested user context");
                            postUserInfoToUnity();
                            break;

                        case "send-notification":
                            console.log("📬 Sending notification:", message);
                            if (userInfoRef.current.fid) {
                                await fetch("/api/send-notification", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                        fid: userInfoRef.current.fid,
                                        title: "🎯 Farcaster Ping!",
                                        body: message,
                                    }),
                                });
                            } else {
                                console.warn("❌ Cannot notify, FID missing");
                            }
                            break;

                        case "request-payment":
                            console.log("💸 Unity requested payment of", amount);
                            await handleUSDCTransaction(amount || "3"); // default: 3 USDC
                            break;

                        default:
                            console.warn("⚠️ Unknown message from Unity:", action);
                    }
                });
            } catch (error) {
                console.error("❌ Error initializing Farcaster bridge:", error);
            }
        };

        const notifyUnityPaymentSuccess = () => {
            const iframe = iframeRef.current;
            if (!iframe?.contentWindow) return;

            iframe.contentWindow.postMessage({
                type: "UNITY_METHOD_CALL",
                method: "SetPaymentSuccess",
                args: ["1"],
            }, "*");

            console.log("✅ Payment success sent to Unity!");
        };

        const handleUSDCTransaction = async (amount: string) => {
            try {
                if (!window.ethereum) {
                    alert("No wallet found. Please install MetaMask.");
                    return;
                }

                const web3 = new Web3(window.ethereum);
                await window.ethereum.request({ method: "eth_requestAccounts" });

                const accounts = await web3.eth.getAccounts();
                const from = accounts[0];

                const usdcContractAddress = "0xd9d5Fb1C1f04Ad2F25B4DbEc917F9E00793D66D4"; // Base USDC
                const receiverAddress = "0xE51f63637c549244d0A8E11ac7E6C86a1E9E0670"; // ✅ YOUR wallet

                const amountInWei = web3.utils.toWei(amount, "mwei"); // USDC = 6 decimals

                const txData = web3.eth.abi.encodeFunctionCall(
                    {
                        name: "transfer",
                        type: "function",
                        inputs: [
                            { type: "address", name: "to" },
                            { type: "uint256", name: "value" },
                        ],
                    },
                    [receiverAddress, amountInWei]
                );

                const tx = await window.ethereum.request({
                    method: "eth_sendTransaction",
                    params: [
                        {
                            from,
                            to: usdcContractAddress,
                            value: "0x0",
                            data: txData,
                        },
                    ],
                });

                console.log("🔁 Payment TX Hash:", tx);
                notifyUnityPaymentSuccess();
            } catch (err) {
                console.error("❌ Payment failed:", err);
                alert("Payment failed. Try again.");
            }
        };

        initBridge();
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
