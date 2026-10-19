import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ configured: Boolean(process.env.JAMENDO_CLIENT_ID), mode: process.env.JAMENDO_CLIENT_ID ? "live" : "mock" });
}
