"use client";

import { useEffect, useRef } from "react";
import sdk from "@farcaster/frame-sdk";
import { ALLOWED_FIDS } from "../utils/AllowedFids";

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

                    // 👤 Send user info to Unity
                    iframe.contentWindow.postMessage(
                        {
                            type: "FARCASTER_USER_INFO",
                            payload: { username, pfpUrl },
                        },
                        "*"
                    );

                    // 🆔 Send FID to Unity
                    iframe.contentWindow.postMessage(
                        {
                            type: "UNITY_METHOD_CALL",
                            method: "SetFarcasterFID",
                            args: [fid],
                        },
                        "*"
                    );

                    // ✅ Check FID gate and send allowed status
                    const isAllowed = ALLOWED_FIDS.includes(Number(fid));
                    iframe.contentWindow.postMessage(
                        {
                            type: "UNITY_METHOD_CALL",
                            method: "SetFidGateState",
                            args: [isAllowed ? "1" : "0"],
                        },
                        "*"
                    );

                    console.log("✅ Posted user info & gate status to Unity:", {
                        username,
                        pfpUrl,
                        fid,
                        isAllowed,
                    });
                };

                // ℹ️ Post info after iframe loads
                const iframe = iframeRef.current;
                if (iframe) {
                    iframe.addEventListener("load", postUserInfoToUnity);
                }

                // 🔄 Listen for Unity-to-parent messages
                window.addEventListener("message", async (event) => {
                    const { type, action, message } = event.data || {};
                    if (type !== "frame-action") return;

                    switch (action) {
                        case "share-game":
                            sdk.actions.openUrl(
                                `https://warpcast.com/~/compose?text=🎮 Try this awesome game!&embeds[]=https://fargo-sable.vercel.app/`
                            );
                            break;

                        case "share-score":
                            sdk.actions.openUrl(
                                `https://warpcast.com/~/compose?text=🏆 I scored ${message} points! Can you beat me?&embeds[]=https://fargo-sable.vercel.app/`
                            );
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

                        default:
                            console.warn("⚠️ Unknown message from Unity:", action);
                    }
                });
            } catch (error) {
                console.error("❌ Error initializing Farcaster bridge:", error);
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
