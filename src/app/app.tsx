"use client";

import { useEffect, useRef } from "react";
import sdk from "@farcaster/frame-sdk";
import { ALLOWED_FIDS } from "../utils/AllowedFids";
import { parseUnits } from "ethers";
import { encodeFunctionData } from "viem";
import { useAccount, useConfig } from "wagmi";
import { getWalletClient } from "wagmi/actions";

type FarcasterUserInfo = {
  username: string;
  pfpUrl: string;
  fid: string;
};

type UnityMessage =
  | {
      type: "FARCASTER_USER_INFO";
      payload: { username: string; pfpUrl: string };
    }
  | {
      type: "UNITY_METHOD_CALL";
      method: string;
      args: string[];
    };

type FrameActionMessage = {
  type: "frame-action";
  action:
    | "get-user-context"
    | "request-payment"
    | "share-game"
    | "share-score"
    | "send-notification";
  message?: string;
  network?: "base" | "celo";
};

type FrameTransactionMessage = {
  type: "farcaster:frame-transaction";
  data?: unknown;
};

type OpenUrlMessage = {
  action: "open-url";
  url: string;
};

function isOpenUrlMessage(msg: unknown): msg is OpenUrlMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "action" in msg &&
    "url" in msg &&
    (msg as Record<string, unknown>).action === "open-url" &&
    typeof (msg as Record<string, unknown>).url === "string"
  );
}

export default function App() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const userInfoRef = useRef<FarcasterUserInfo>({
    username: "Guest",
    pfpUrl: "",
    fid: "",
  });

  const { address, isConnected } = useAccount();
  const config = useConfig();

  useEffect(() => {
    const init = async () => {
      try {
        await sdk.actions.ready();
        await sdk.actions.addFrame();

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

        window.addEventListener("message", async (event) => {
          const data = event.data;

          // === HANDLE FRAME ACTIONS ===
          if (data?.type === "frame-action") {
            const actionData = data as FrameActionMessage;

            switch (actionData.action) {
              case "get-user-context":
                console.log("📨 Unity requested Farcaster user context");
                postToUnity();
                break;

              case "request-payment":
                {
                  const network = actionData.network || "base";
                  console.log(`💸 Unity requested 1 USDC payment on ${network}`);

                  if (!isConnected) {
                    console.warn("❌ Wallet not connected. Prompt user to connect.");
                    return;
                  }

                  let client;
                  try {
                    client = await getWalletClient(config);
                  } catch (e) {
                    console.error("❌ Wallet client fetch error:", e);
                    return;
                  }

                  if (!client) {
                    console.error("❌ Wallet client not available");
                    return;
                  }

                  // === Network-specific settings ===
                  const networks: Record<
                    string,
                    { usdc: string; recipient: string }
                  > = {
                    base: {
                      usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                      recipient: "0xE51f63637c549244d0A8E11ac7E6C86a1E9E0670",
                    },
                    celo: {
                      usdc: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
                      recipient: "0xE51f63637c549244d0A8E11ac7E6C86a1E9E0670",
                    },
                  };

                  const chain = networks[network];
                  if (!chain) {
                    console.error("❌ Unsupported network:", network);
                    return;
                  }

                  const txData = encodeFunctionData({
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
                    args: [chain.recipient, parseUnits("1", 6)],
                  });

                  try {
                    const txHash = await client.sendTransaction({
                      to: chain.usdc,
                      data: txData,
                      value: 0n,
                    });

                    console.log(`✅ ${network.toUpperCase()} USDC TX Sent:`, txHash);

                    iframeRef.current?.contentWindow?.postMessage(
                      {
                        type: "UNITY_METHOD_CALL",
                        method: "SetPaymentSuccess",
                        args: ["1"],
                      },
                      "*"
                    );
                  } catch (err) {
                    console.error(`❌ ${network.toUpperCase()} Payment failed:`, err);
                  }
                }
                break;

              case "share-game":
                console.log("🎮 Unity requested to share game");
                sdk.actions.openUrl(
                  `https://warpcast.com/~/compose?text=Math is mathing! 💥 Just smashed another level in Based Run by @trenchverse 🚀&embeds[]=https://fargo-sable.vercel.app`
                );
                break;

              case "share-score":
                console.log("🏆 Unity requested to share score:", actionData.message);
                sdk.actions.openUrl(
                  `https://warpcast.com/~/compose?text=🏆 I scored ${actionData.message} points! Can you beat me?&embeds[]=https://fargo-sable.vercel.app`
                );
                break;

              case "send-notification":
                console.log("📬 Notification requested:", actionData.message);
                if (userInfoRef.current.fid) {
                  await fetch("/api/send-notification", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      fid: userInfoRef.current.fid,
                      title: "🎯 Farcaster Ping!",
                      body: actionData.message,
                    }),
                  });
                } else {
                  console.warn("❌ Cannot send notification, FID missing");
                }
                break;
            }
          }

          // === HANDLE OPEN URLS ===
          if (data?.action?.startsWith("open-url")) {
            const target = data.url;
            if (typeof target === "string" && target.startsWith("http")) {
              console.log("🌐 Opening URL via Farcaster SDK:", target);
              sdk.actions.openUrl(target);
            }
          }

          if (isOpenUrlMessage(data)) {
            console.log("🌐 Opening URL via Farcaster SDK:", data.url);
            sdk.actions.openUrl(data.url);
          }
        });

        // === Handle transaction confirmations ===
        window.addEventListener(
          "message",
          (event: MessageEvent<FrameTransactionMessage>) => {
            if (
              typeof event.data === "object" &&
              event.data !== null &&
              "type" in event.data &&
              event.data.type === "farcaster:frame-transaction"
            ) {
              console.log("✅ Frame Wallet transaction confirmed");
            }
          }
        );
      } catch (err) {
        console.error("❌ Error initializing bridge:", err);
      }
    };

    init();
  }, [address, config, isConnected]);

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
