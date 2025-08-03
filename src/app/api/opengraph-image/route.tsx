import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { getNeynarUser } from "~/lib/neynar";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const fid = searchParams.get('fid');

    const user = fid ? await getNeynarUser(Number(fid)) : null;

    return new ImageResponse(
        (
            <div tw="flex items-center justify-center w-full h-full relative">
                <img
                    src="https://i.ibb.co/QjrK07K9/1000083019.jpg" // ✅ Replace this with your full image URL
                    alt="OG Image"
                    tw="absolute w-full h-full object-cover"
                />
                {/* Optional: overlay user’s name or pfp */}
                {user?.display_name && (
                    <h1 tw="absolute bottom-12 text-white text-6xl font-bold bg-black bg-opacity-50 px-6 py-2 rounded-lg">
                        {user.display_name}
                    </h1>
                )}
            </div>
        ),
        {
            width: 1200,
            height: 800,
        }
    );
}