import { hasApiKey } from "@/lib/anthropic";

export const instant = false;

export async function GET() {
  return Response.json({ hasApiKey: hasApiKey() });
}
