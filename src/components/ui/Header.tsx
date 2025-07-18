"use client";

import { useState } from "react";
import { APP_NAME } from "~/lib/constants";
import sdk from "@farcaster/miniapp-sdk";
import { useMiniApp } from "@neynar/react";

type HeaderProps = {
  neynarUser?: {
    fid: number;
    score: number;
  } | null;
};

export function Header({ neynarUser }: HeaderProps) {
  const { context } = useMiniApp();
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);

  const user = context?.user;

  return (
    <div className="relative z-10">
      <div className="mt-4 mb-4 mx-4 px-2 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-between border-[3px] border-double border-primary">
        <div className="text-lg font-light">
          Welcome to {APP_NAME}!
        </div>

        {user && (
          <div
            className="cursor-pointer"
            onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
          >
            {user.pfpUrl && (
              <img
                src={user.pfpUrl}
                alt="Profile"
                className="w-10 h-10 rounded-full border-2 border-primary"
              />
            )}
          </div>
        )}
      </div>

      {user && isUserDropdownOpen && (
        <div className="absolute top-full right-4 mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 w-64 p-3 z-50">
          <div className="text-right space-y-1">
            <h3
              className="font-bold text-sm hover:underline cursor-pointer"
              onClick={() => sdk.actions.viewProfile({ fid: user.fid })}
            >
              {user.displayName || user.username}
            </h3>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              @{user.username}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              FID: {user.fid}
            </p>
            {neynarUser?.score !== undefined && (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Neynar Score: {neynarUser.score}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
