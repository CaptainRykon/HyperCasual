'use client';

import dynamic from 'next/dynamic';
import { useCallback, useState } from 'react';
import { useMiniApp } from '@neynar/react';
import { ShareButton } from '../Share';
import { Button } from '../Button';
import { SignIn } from '../wallet/SignIn';
import { type Haptics } from '@farcaster/miniapp-sdk';
import { APP_URL } from '~/lib/constants';

// Optional import for NeynarAuthButton - may not exist in all templates
const NeynarAuthButton = dynamic(
  () =>
    Promise.resolve().then(() => {
      try {
        // @ts-expect-error - NeynarAuthButton may not exist in all template variants
        const mod = eval('require("../NeynarAuthButton/index")');
        return mod.default || mod.NeynarAuthButton;
      } catch {
        return () => null;
      }
    }),
  { ssr: false }
);

export function ActionsTab() {
  const { actions, added, notificationDetails, haptics, context } =
    useMiniApp();

  const [notificationState, setNotificationState] = useState({
    sendStatus: '',
    shareUrlCopied: false,
  });
  const [selectedHapticIntensity, setSelectedHapticIntensity] =
    useState<Haptics.ImpactOccurredType>('medium');

  const sendFarcasterNotification = useCallback(async () => {
    setNotificationState((prev) => ({ ...prev, sendStatus: '' }));
    if (!notificationDetails || !context) return;

    try {
      const response = await fetch('/api/send-notification', {
        method: 'POST',
        mode: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fid: context.user.fid,
          notificationDetails,
        }),
      });

      if (response.status === 200) {
        setNotificationState((prev) => ({ ...prev, sendStatus: 'Success' }));
      } else if (response.status === 429) {
        setNotificationState((prev) => ({
          ...prev,
          sendStatus: 'Rate limited',
        }));
      } else {
        const responseText = await response.text();
        setNotificationState((prev) => ({
          ...prev,
          sendStatus: `Error: ${responseText}`,
        }));
      }
    } catch (err) {
      setNotificationState((prev) => ({
        ...prev,
        sendStatus: `Error: ${err}`,
      }));
    }
  }, [context, notificationDetails]);

  const copyUserShareUrl = useCallback(async () => {
    if (context?.user?.fid) {
      const userShareUrl = `${APP_URL}/share/${context.user.fid}`;
      await navigator.clipboard.writeText(userShareUrl);
      setNotificationState((prev) => ({ ...prev, shareUrlCopied: true }));
      setTimeout(
        () =>
          setNotificationState((prev) => ({ ...prev, shareUrlCopied: false })),
        2000
      );
    }
  }, [context?.user?.fid]);

  const triggerHapticFeedback = useCallback(async () => {
    try {
      await haptics.impactOccurred(selectedHapticIntensity);
    } catch (err) {
      console.error('Haptic feedback failed:', err);
    }
  }, [haptics, selectedHapticIntensity]);

  return (
    <div className="space-y-3 px-6 w-full max-w-md mx-auto">
      <ShareButton
        buttonText="Share Mini App"
        cast={{
          text: 'Check out this awesome frame @1 @2 @3! 🚀🪐',
          bestFriends: true,
          embeds: [`${APP_URL}/share/${context?.user?.fid || ''}`],
        }}
        className="w-full"
      />

      <SignIn />

      {NeynarAuthButton && <NeynarAuthButton />}

      <Button
        onClick={() =>
          actions.openUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
        }
        className="w-full"
      >
        Open Link
      </Button>

      <Button onClick={actions.addMiniApp} disabled={added} className="w-full">
        Add Mini App to Client
      </Button>

      {notificationState.sendStatus && (
        <div className="text-sm w-full">
          Send notification result: {notificationState.sendStatus}
        </div>
      )}
      <Button
        onClick={sendFarcasterNotification}
        disabled={!notificationDetails}
        className="w-full"
      >
        Send notification
      </Button>

      <Button
        onClick={copyUserShareUrl}
        disabled={!context?.user?.fid}
        className="w-full"
      >
        {notificationState.shareUrlCopied ? 'Copied!' : 'Copy share URL'}
      </Button>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Haptic Intensity
        </label>
        <select
          value={selectedHapticIntensity}
          onChange={(e) =>
            setSelectedHapticIntensity(
              e.target.value as Haptics.ImpactOccurredType
            )
          }
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="light">Light</option>
          <option value="medium">Medium</option>
          <option value="heavy">Heavy</option>
          <option value="soft">Soft</option>
          <option value="rigid">Rigid</option>
        </select>
        <Button onClick={triggerHapticFeedback} className="w-full">
          Trigger Haptic Feedback
        </Button>
      </div>
    </div>
  );
}
