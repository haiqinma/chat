import { NextResponse } from "next/server";

import { getRuntimePublicConfig } from "../../config/runtime";

function handle() {
  return NextResponse.json(getRuntimePublicConfig(), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export const GET = handle;
export const POST = handle;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
