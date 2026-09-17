import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatInTz } from "@/lib/time";

export type ConvMessage = { id: string; fromTeam: boolean; authorEmail: string; body: string; createdAt: Date };

const CATEGORY: Record<string, string> = { idea: "Idea", bug: "Something's broken", question: "Question", other: "Other" };
export const categoryLabel = (c: string) => CATEGORY[c] ?? c;

export function StatusBadge({ status }: { status: string }) {
  return status === "closed" ? <Badge variant="secondary">Closed</Badge> : <Badge variant="success">Open</Badge>;
}

/** Chat bubbles. `side`: whose messages sit on the right (the viewer's own). */
export function Conversation({ messages, side, tz, teamName = "droplr.fm team" }: { messages: ConvMessage[]; side: "user" | "team"; tz: string; teamName?: string }) {
  return (
    <ol className="space-y-3">
      {messages.map((m) => {
        const mine = side === "team" ? m.fromTeam : !m.fromTeam;
        return (
          <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
            <div className={cn("max-w-[85%] rounded-2xl px-4 py-3 text-sm sm:max-w-[70%]", mine ? "rounded-br-md bg-violet-600 text-white" : "rounded-bl-md border bg-secondary/60")}>
              <p className={cn("mb-1 text-xs", mine ? "text-violet-100" : "text-muted-foreground")}>
                {m.fromTeam ? teamName : m.authorEmail} · {formatInTz(m.createdAt, tz, { dateStyle: "medium", timeStyle: "short" })}
              </p>
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
