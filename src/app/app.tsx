"use client";

import { useEffect, useRef } from "react";
import sdk from "@farcaster/frame-sdk";
import { ALLOWED_FIDS } from "../utils/AllowedFids";
import { parseUnits } from "ethers";
import { encodeFunctionData } from "viem";
import { useAccount, useConfig } from "wagmi";
import { getWalletClient } from "wagmi/actions";

declare global {
  interface Window {
    farcaster?: unknown;
    base?: {
      // Base App injects a provider that implements EIP-1193 methods like wallet_sendCalls
      provider?: {
        request: (args: { method: string; params?: any[] }) => Promise<any>;
      };
    };
    ethereum?: {
      request?: (args: { method: string; params?: any[] }) => Promise<any>;
    };
  }
}

type FarcasterUserInfo = { username: string; pfpUrl: string; fid: string };

type UnityMessage =
  | { type: "FARCASTER_USER_INFO"; payload: { username: string; pfpUrl: string } }
  | { type: "UNITY_METHOD_CALL"; method: string; args: string[] };

type FrameActionMessage = {
  type: "frame-action";
  action:
    | "get-user-context"
    | "request-payment"
    | "share-game"
    | "share-score"
    | "send-notification";
  message?: string;
};

type FrameTransactionMessage = { type: "farcaster:frame-transaction"; data?: unknown };
type OpenUrlMessage = { action: "open-url"; url: string };

function isOpenUrlMessage(msg: unknown): msg is OpenUrlMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "action" in msg &&
    "url" in msg &&
    (msg as any).action === "open-url" &&
    typeof (msg as any).url === "string"
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
        const isFarcaster = !!window.farcaster;
        const isBaseApp = !!window.base;

        // ========================================================
        // FARCASTER MINI APP (UNCHANGED)
        // ========================================================
        if (isFarcaster) {
          await sdk.actions.ready();
          await sdk.actions.addFrame();
          const context = await sdk.context;
          const user = context?.user || {};

          userInfoRef.current = {
            username: user.username ?? "Guest",
            pfpUrl: user.pfpUrl ?? "",
            fid: user.fid?.toString() ?? "",
          };

          const postToUnity = () => {
            const iw = iframeRef.current?.contentWindow;
            if (!iw) return;

            const { username, pfpUrl, fid } = userInfoRef.current;
            const isAllowed = ALLOWED_FIDS.includes(Number(fid));

            const messages: UnityMessage[] = [
              { type: "FARCASTER_USER_INFO", payload: { username, pfpUrl } },
              { type: "UNITY_METHOD_CALL", method: "SetFarcasterFID", args: [fid] },
              { type: "UNITY_METHOD_CALL", method: "SetFidGateState", args: [isAllowed ? "1" : "0"] },
            ];

            messages.forEach((msg) => iw.postMessage(msg, "*"));
          };

          iframeRef.current?.addEventListener("load", postToUnity);

          window.addEventListener("message", async (event) => {
            const data = event.data;
            if (data?.type === "frame-action") {
              const actionData = data as FrameActionMessage;
              switch (actionData.action) {
                case "get-user-context":
                  postToUnity();
                  break;

                case "request-payment": {
                  if (!isConnected) return;
                  const client = await getWalletClient(config).catch(() => null);
                  if (!client) return;

                  const recipient = "0xE51f63637c549244d0A8E11ac7E6C86a1E9E0670";
                  const usdcContract = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // Base USDC
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
                    args: [recipient, parseUnits("2", 6)],
                  });

                  await client
                    .sendTransaction({
                      to: usdcContract,
                      data: txData,
                      value: 0n,
                    })
                    .then(() =>
                      iframeRef.current?.contentWindow?.postMessage(
                        { type: "UNITY_METHOD_CALL", method: "SetPaymentSuccess", args: ["1"] },
                        "*",
                      ),
                    )
                    .catch((e) => console.error("❌ Payment failed:", e));
                  break;
                }

                case "share-game":
                  sdk.actions.openUrl(
                    `https://warpcast.com/~/compose?text=Math is mathing! Just smashed another level in Based Run 🚀&embeds[]=https://fargo-sable.vercel.app`,
                  );
                  break;

                case "share-score":
                  sdk.actions.openUrl(
                    `https://warpcast.com/~/compose?text=🏆 I scored ${actionData.message} points! Can you beat me?&embeds[]=https://fargo-sable.vercel.app`,
                  );
                  break;

                case "send-notification":
                  if (userInfoRef.current.fid) {
                    await fetch("/api/send-notification", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        fid: userInfoRef.current.fid,
                        title: "Farcaster Ping!",
                        body: actionData.message,
                      }),
                    });
                  }
                  break;
              }
            }

            if (data?.action?.startsWith("open-url") || isOpenUrlMessage(data)) {
              const target = (data as any).url;
              if (typeof target === "string" && target.startsWith("http")) {
                sdk.actions.openUrl(target);
              }
            }
          });

          window.addEventListener("message", (event: MessageEvent<FrameTransactionMessage>) => {
            if (event.data?.type === "farcaster:frame-transaction") {
              console.log("✅ Frame Wallet transaction confirmed");
            }
          });
        }

        // ========================================================
        // BASE MINI APP (USDC PAYMENT FLOW via wallet_sendCalls)
        // ========================================================
        if (isBaseApp) {
          console.log("🌐 Running inside Base App Mini App");

          // MiniKit hooks are typically used with a provider; for a pure imperative flow in Mini Apps,
          // call the Base provider directly with wallet_sendCalls.
          // Docs: https://docs.base.org/.../provider/methods#wallet_sendcalls (see "Accept Payments" & reference)
          const baseProvider =
            window.base?.provider || window.ethereum; // fallback if provider is surfaced on window.ethereum

          // Optionally: pull user context if exposed by the host app in your environment
          userInfoRef.current = {
            username: "Guest",
            pfpUrl: "",
            fid: "",
          };

          const postToUnity = () => {
            const iw = iframeRef.current?.contentWindow;
            if (!iw) return;

            const { username, pfpUrl, fid } = userInfoRef.current;
            const messages: UnityMessage[] = [
              { type: "FARCASTER_USER_INFO", payload: { username, pfpUrl } },
              { type: "UNITY_METHOD_CALL", method: "SetFarcasterFID", args: [fid] },
            ];
            messages.forEach((msg) => iw.postMessage(msg, "*"));
          };

          iframeRef.current?.addEventListener("load", postToUnity);

          window.addEventListener("message", async (event) => {
            const data = event.data;
            if (data?.type === "frame-action") {
              const actionData = data as FrameActionMessage;
              switch (actionData.action) {
                case "get-user-context":
                  postToUnity();
                  break;

                case "request-payment": {
                  if (!baseProvider?.request) {
                    console.error("❌ No Base provider available in this environment.");
                    return;
                  }

                  const recipient = "0xE51f63637c549244d0A8E11ac7E6C86a1E9E0670";
                  const usdcContract = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // Base USDC (8453)
                  const txDataBase = encodeFunctionData({
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

                  try {
                    await baseProvider.request({
                      method: "wallet_sendCalls",
                      params: [
                        {
                          version: "1.0",
                          chainId: "0x2105", // 8453 Base mainnet
                          calls: [{ to: usdcContract, data: txDataBase }],
                          // Optional capabilities (e.g., paymasterService) can be added here
                          // capabilities: { paymasterService: { url: "https://..." } },
                        },
                      ],
                    });

                    iframeRef.current?.contentWindow?.postMessage(
                      { type: "UNITY_METHOD_CALL", method: "SetPaymentSuccess", args: ["1"] },
                      "*",
                    );
                  } catch (err) {
                    console.error("❌ Base USDC payment failed:", err);
                    iframeRef.current?.contentWindow?.postMessage(
                      { type: "UNITY_METHOD_CALL", method: "SetPaymentSuccess", args: ["0"] },
                      "*",
                    );
                  }
                  break;
                }

                case "share-game": {
                  const url =
                    "https://warpcast.com/~/compose?text=🚀 Playing Based Run inside Base App! 💥&embeds[]=https://fargo-sable.vercel.app";
                  // If the host exposes an openUrl action, use it; otherwise fall back to window.open
                  try {
                    // @ts-ignore - some hosts may expose actions
                    if ((window as any).base?.actions?.openUrl) {
                      // @ts-ignore
                      (window as any).base.actions.openUrl(url);
                    } else {
                      window.open(url, "_blank");
                    }
                  } catch {
                    window.open(url, "_blank");
                  }
                  break;
                }

                case "share-score": {
                  const url = `https://warpcast.com/~/compose?text=🏆 I scored ${actionData.message} points in Based Run (Base App)!&embeds[]=https://fargo-sable.vercel.app`;
                  try {
                    // @ts-ignore
                    if ((window as any).base?.actions?.openUrl) {
                      // @ts-ignore
                      (window as any).base.actions.openUrl(url);
                    } else {
                      window.open(url, "_blank");
                    }
                  } catch {
                    window.open(url, "_blank");
                  }
                  break;
                }
              }
            }

            if (data?.action?.startsWith("open-url") || isOpenUrlMessage(data)) {
              const target = (data as any).url;
              if (typeof target === "string" && target.startsWith("http")) {
                try {
                  // @ts-ignore
                  if ((window as any).base?.actions?.openUrl) {
                    // @ts-ignore
                    (window as any).base.actions.openUrl(target);
                  } else {
                    window.open(target, "_blank");
                  }
                } catch {
                  window.open(target, "_blank");
                }
              }
            }
          });
        }
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
