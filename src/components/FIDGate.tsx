import { useEffect } from "react";
import sdk from "@farcaster/frame-sdk";
import { ALLOWED_FIDS } from "../utils/AllowedFids";

export default function FIDGate() {
    useEffect(() => {
        const checkFID = async () => {
            try {
                await sdk.actions.ready();
                const ctx = await sdk.context;

                const fid = ctx?.user?.fid;
                console.log("🔍 FIDGate - Player fid:", fid);

                const isAllowed = fid !== undefined && ALLOWED_FIDS.includes(fid);

                console.log("✅ FIDGate - isAllowed:", isAllowed);

                if (typeof window !== "undefined" && window.parent) {
                    // Send fid to Unity
                    window.parent.postMessage(
                        {
                            type: "UNITY_METHOD_CALL",
                            method: "SetFarcasterFID",
                            args: [fid?.toString() || "0"],
                        },
                        "*"
                    );

                    // Send list verification result
                    window.parent.postMessage(
                        {
                            type: "UNITY_METHOD_CALL",
                            method: "SetUserInList",
                            args: [isAllowed ? "1" : "0"],
                        },
                        "*"
                    );

                    console.log("📤 Sent SetUserInList =", isAllowed ? "1" : "0");
                }
            } catch (err) {
                console.error("❌ FIDGate error:", err);
            }
        };

        checkFID();
    }, []);

    return null;
}
