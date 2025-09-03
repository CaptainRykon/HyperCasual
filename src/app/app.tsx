"use client";

import { useEffect, useRef } from "react";
import sdk from "@farcaster/frame-sdk";
import { ALLOWED_FIDS } from "../utils/AllowedFids";
import { parseUnits } from "ethers";
import { encodeFunctionData } from "viem";
import { useAccount, useConfig } from "wagmi";
import { getWalletClient } from "wagmi/actions";

// ✅ Types for Base + Farcaster
interface BaseProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

interface BaseActions {
  openUrl: (url: string) => void;
}

interface BaseWindow {
  provider?: BaseProvider;
  actions?: BaseActions;
}

declare global {
  interface Window {
    farcaster?: unknown;
    base?: BaseWindow;
    ethereum?: {
      request?: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

// ---- Farcaster/User Types ----
type FarcasterUserInfo = { username: string; pfpUrl: string; fid: string };

type UnityMessage =
  | { type: "FARCASTER_USER_INFO"; payload: { username: string; pfpUrl: string } }
  | { type: "UNITY_METHOD_CALL"; method: string; args: string[] };

type FrameActionMessage = {
  type: "frame-action";
  action: "get-user-context" | "request-payment" | "share-game" | "share-score" | "send-notification";
  message?: string;
};

type FrameTransactionMessage = { type: "farcaster:frame-transaction"; data?: unknown };
type OpenUrlMessage = { action: "open-url"; url: string };

type IncomingMessage = FrameActionMessage | FrameTransactionMessage | OpenUrlMessage | unknown;

function isOpenUrlMessage(msg: unknown): msg is OpenUrlMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "action" in msg &&
    (msg as any).action === "open-url" &&
    "url" in msg &&
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
        // FARCASTER MINI APP
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

          window.addEventListener("message", async (event: MessageEvent<IncomingMessage>) => {
            const data = event.data;
            if (!data || typeof data !== "object") return;

            if ("type" in data && (data as FrameActionMessage).type === "frame-action") {
              const actionData = data as FrameActionMessage;
              switch (actionData.action) {
                case "get-user-context":
                  postToUnity();
                  break;

                case "request-payment":
                  if (!isConnected) return;
                  const client = await getWalletClient(config).catch(() => null);
                  if (!client) return;

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
                    args: ["0xE51f63637c549244d0A8E11ac7E6C86a1E9E0670", parseUnits("2", 6)],
                  });

                  await client
                    .sendTransaction({
                      to: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC Base contract
                      data: txData,
                      value: 0n,
                    })
                    .then(() =>
                      iframeRef.current?.contentWindow?.postMessage(
                        { type: "UNITY_METHOD_CALL", method: "SetPaymentSuccess", args: ["1"] },
                        "*"
                      )
                    )
                    .catch((e) => console.error("❌ Payment failed:", e));
                  break;

                case "share-game":
                  sdk.actions.openUrl(
                    `https://warpcast.com/~/compose?text=Math is mathing! Just smashed another level in Based Run 🚀&embeds[]=https://fargo-sable.vercel.app`
                  );
                  break;

                case "share-score":
                  sdk.actions.openUrl(
                    `https://warpcast.com/~/compose?text=🏆 I scored ${actionData.message} points! Can you beat me?&embeds[]=https://fargo-sable.vercel.app`
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

            if (isOpenUrlMessage(data)) {
              const target = data.url;
              if (target.startsWith("http")) {
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
        // BASE MINI APP
        // ========================================================
        if (isBaseApp) {
          console.log("Base App Mini App detected");

          // ---- Get Base provider/actions
          const baseProvider = window.base?.provider ?? window.ethereum;
          const baseActions = window.base?.actions;

          // ---- Fake user for demo (replace with miniKit context if needed)
          userInfoRef.current = {
            username: "BaseUser",
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

          window.addEventListener("message", async (event: MessageEvent<IncomingMessage>) => {
            const data = event.data;
            if (!data || typeof data !== "object") return;

            if ("type" in data && (data as FrameActionMessage).type === "frame-action") {
              const actionData = data as FrameActionMessage;

              switch (actionData.action) {
                case "get-user-context":
                  postToUnity();
                  break;

                case "request-payment":
                  if (!baseProvider?.request) return;

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
                    args: ["0xE51f63637c549244d0A8E11ac7E6C86a1E9E0670", parseUnits("2", 6)],
                  });

                  try {
                    await baseProvider.request({
                      method: "eth_sendTransaction",
                      params: [
                        {
                          to: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC Base contract
                          data: txDataBase,
                          value: "0x0",
                        },
                      ],
                    });

                    iframeRef.current?.contentWindow?.postMessage(
                      { type: "UNITY_METHOD_CALL", method: "SetPaymentSuccess", args: ["1"] },
                      "*"
                    );
                  } catch (err) {
                    console.error("❌ Base USDC payment failed:", err);
                    iframeRef.current?.contentWindow?.postMessage(
                      { type: "UNITY_METHOD_CALL", method: "SetPaymentSuccess", args: ["0"] },
                      "*"
                    );
                  }
                  break;

                case "share-game":
                  baseActions?.openUrl(
                    `https://warpcast.com/~/compose?text=Playing Based Run (Base App)!&embeds[]=https://fargo-sable.vercel.app`
                  );
                  break;

                case "share-score":
                  baseActions?.openUrl(
                    `https://warpcast.com/~/compose?text=I scored ${actionData.message} points in Based Run (Base App)!&embeds[]=https://fargo-sable.vercel.app`
                  );
                  break;
              }
            }

            if (isOpenUrlMessage(data)) {
              const target = data.url;
              if (target.startsWith("http")) {
                baseActions?.openUrl(target) ?? window.open(target, "_blank");
              }
            }
          });
        }
      } catch (err) {
        console.error("Bridge initialization error:", err);
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
