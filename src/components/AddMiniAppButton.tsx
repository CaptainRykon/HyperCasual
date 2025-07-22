/* components/addMiniApp.tsx */
'use client'

import { useEffect, useRef } from 'react'
import { sdk } from '@farcaster/frame-sdk'  // npm i @farcaster/frame-sdk

export default function AddMiniApp() {
  // ensure we only prompt once per page load
  const fired = useRef(false)

  useEffect(() => {
    if (fired.current) return
    fired.current = true

    ;(async () => {
      try {
        await sdk.actions.addMiniApp()   // <-- opens the native Warpcast dialog :contentReference[oaicite:0]{index=0}
      } catch (err) {
        // RejectedByUser is normal if they tap “Cancel”
        console.debug('addMiniApp dismissed:', err)
      }
    })()
  }, [])

  return null        // nothing to render
}
