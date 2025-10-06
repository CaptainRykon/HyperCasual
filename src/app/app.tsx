"use client";

import { useEffect, useRef } from "react";
import sdk from "@farcaster/frame-sdk";
import { ALLOWED_FIDS } from "../utils/AllowedFids";
import { parseUnits } from "ethers";
import { encodeFunctionData } from "viem";
import { useAccount, useConfig, useSwitchChain } from "wagmi";
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
  network?: "base" | "celo"; // 👈 network comes from Unity
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

  const { address, isConnected, chainId } = useAccount();
  const config = useConfig();
  const { switchChainAsync } = useSwitchChain();

  // 🧠 Define supported networks
  const NETWORK_CONFIG = {
    base: {
      name: "Base",
      chainId: 8453,
      usdcContract:
        "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`,
    },
    celo: {
      name: "Celo",
      chainId: 42220,
      usdcContract:
        "0xcebA9300f2b948710d2653dD7B07f33A8B32118C" as `0x${string}`,
    },
  };

  const RECIPIENT =
    "0xE51f63637c549244d0A8E11ac7E6C86a1E9E0670" as `0x${string}`;
  const PAYMENT_AMOUNT = "1"; // 1 USDC

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

        // 🧩 Listen for Unity messages
        window.addEventListener("message", async (event) => {
          const data = event.data;

          if (data?.type === "frame-action") {
            const actionData = data as FrameActionMessage;

            switch (actionData.action) {
              case "get-user-context":
                console.log("📨 Unity requested Farcaster user context");
                postToUnity();
                break;

              case "request-payment":
                console.log(
                  `💸 Unity requested payment (${PAYMENT_AMOUNT} USDC)`
                );

                if (!isConnected) {
                  console.warn("❌ Wallet not connected.");
                  iframeRef.current?.contentWindow?.postMessage(
                    {
                      type: "UNITY_METHOD_CALL",
                      method: "SetPaymentError",
                      args: ["WALLET_NOT_CONNECTED"],
                    },
                    "*"
                  );
                  return;
                }

                const selectedNetwork = actionData.network || "base";
                const network = NETWORK_CONFIG[selectedNetwork];

                // ✅ Ensure chain match
                if (chainId !== network.chainId) {
                  console.log(`🔄 Switching to ${network.name}...`);
                  try {
                    await switchChainAsync?.({ chainId: network.chainId });
                    console.log(`✅ Switched to ${network.name}`);
                  } catch (e) {
                    console.error("❌ Network switch failed:", e);
                    iframeRef.current?.contentWindow?.postMessage(
                      {
                        type: "UNITY_METHOD_CALL",
                        method: "SetPaymentError",
                        args: ["NETWORK_SWITCH_FAILED", selectedNetwork],
                      },
                      "*"
                    );
                    return;
                  }
                }

                const client = await getWalletClient(config, {
                  chainId: network.chainId,
                });
                if (!client) {
                  console.error("❌ Wallet client unavailable");
                  return;
                }

                // Encode ERC20 transfer
                const amountInWei = parseUnits(PAYMENT_AMOUNT, 6);
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
                  args: [RECIPIENT, amountInWei],
                });

                try {
                  const txHash = await client.sendTransaction({
                    to: network.usdcContract,
                    data: txData,
                    value: 0n,
                  });

                  console.log(`✅ Transaction sent on ${network.name}:`, txHash);

                  iframeRef.current?.contentWindow?.postMessage(
                    {
                      type: "UNITY_METHOD_CALL",
                      method: "SetPaymentSuccess",
                      args: ["1", selectedNetwork, txHash],
                    },
                    "*"
                  );
                } catch (err) {
                  console.error(`❌ Payment failed on ${network.name}:`, err);
                  iframeRef.current?.contentWindow?.postMessage(
                    {
                      type: "UNITY_METHOD_CALL",
                      method: "SetPaymentError",
                      args: ["TX_FAILED", selectedNetwork],
                    },
                    "*"
                  );
                }
                break;

              case "share-game":
                sdk.actions.openUrl(
                  `https://warpcast.com/~/compose?text=Math is mathing! 💥 Just smashed another level in Based Run by @trenchverse 🚀 &embeds[]=https://fargo-sable.vercel.app`
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
                      title: "🎯 Farcaster Ping!",
                      body: actionData.message,
                    }),
                  });
                }
                break;
            }
          }

          if (isOpenUrlMessage(data)) {
            sdk.actions.openUrl(data.url);
          }
        });

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
  }, [address, config, isConnected, chainId, switchChainAsync]);

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
