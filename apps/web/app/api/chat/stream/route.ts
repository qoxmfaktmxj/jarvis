import { requirePageSession } from "@/lib/server/page-auth";
import { getChatListenPool } from "@/lib/db/chat-listen-pool";
import { chatChannel } from "@jarvis/shared/chat/channel";
import {
  getMessageById,
  getReactionsForMessage
} from "@/lib/queries/chat";

export const dynamic = "force-dynamic";

function sseFormat(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(req: Request) {
  const session = await requirePageSession();
  const channel = chatChannel(session.workspaceId);
  const viewerId = session.userId;

  const pool = getChatListenPool();
  const client = await pool.connect();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const push = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      await client.query(`LISTEN ${channel}`);
      push(sseFormat("ready", { ok: true }));

      const heartbeat = setInterval(() => push(`: keepalive\n\n`), 15_000);

      const onNotify = async (msg: {
        channel: string;
        payload?: string;
      }) => {
        if (msg.channel !== channel || !msg.payload) return;
        let parsed: { kind: string; id: string };
        try {
          parsed = JSON.parse(msg.payload);
        } catch {
          return;
        }
        if (parsed.kind === "message") {
          const row = await getMessageById(parsed.id);
          if (row) push(sseFormat("message", row));
        } else if (parsed.kind === "reaction") {
          const rx = await getReactionsForMessage(parsed.id, viewerId);
          push(sseFormat("reaction", { messageId: parsed.id, reactions: rx }));
        } else if (parsed.kind === "delete") {
          push(sseFormat("delete", { id: parsed.id }));
        }
      };
      client.on("notification", onNotify);

      const cleanup = async () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        client.removeListener("notification", onNotify);
        try {
          await client.query(`UNLISTEN ${channel}`);
        } catch {
          /* ignore */
        }
        client.release();
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      };
      req.signal.addEventListener("abort", () => void cleanup());
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    }
  });
}
