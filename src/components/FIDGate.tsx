import { useEffect } from "react";
import sdk from "@farcaster/frame-sdk";
import { ALLOWED_FIDS } from "../utils/AllowedFids";

export default function FIDGate() {
    useEffect(() => {
        const checkFID = async () => {
            try {
                await sdk.actions.ready();
                const ctx = await sdk.context;

                const fid = ctx?.user?.fid as number | undefined;

                console.log("🔍 Player fid:", fid);
                const allowed = fid !== undefined && ALLOWED_FIDS.includes(fid);

                if (typeof window !== "undefined" && window.parent) {
                    window.parent.postMessage(
                        {
                            type: "UNITY_METHOD_CALL",
                            method: "SetUserInList",
                            args: [allowed ? "1" : "0"],
                        },
                        "*"
                    );
                    console.log("✅ Sent user-in-list:", allowed);
                }
            } catch (err) {
                console.error("❌ FIDGate check failed:", err);
            }
        };

        checkFID();
    }, []);

    return null; // This component does not render anything
}
