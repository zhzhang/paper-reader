export const instant = false;

const MAX_BYTES = 50 * 1024 * 1024;

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url");
  if (!url) return new Response("Missing url", { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return new Response("Invalid url", { status: 400 });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return new Response("Only http(s) URLs allowed", { status: 400 });
  }

  try {
    const res = await fetch(parsed.toString(), {
      headers: { "User-Agent": "paper-reader/0.1" },
      redirect: "follow",
    });
    if (!res.ok) return new Response(`Upstream ${res.status}`, { status: 502 });
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) {
      return new Response("PDF too large", { status: 413 });
    }
    if (
      buf.byteLength < 5 ||
      buf[0] !== 0x25 ||
      buf[1] !== 0x50 ||
      buf[2] !== 0x44 ||
      buf[3] !== 0x46
    ) {
      return new Response("Not a PDF", { status: 415 });
    }
    return new Response(buf, {
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(message, { status: 502 });
  }
}
