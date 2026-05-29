import { AppShell } from "@/components/app/app-shell";
import { ChatPage } from "@/components/chat/chat-page";
import { getRecentChatHistory, listChatSessions } from "@/lib/db";

export default function HomePage() {
  const sessions = listChatSessions();
  const activeSession = sessions[0] ?? null;

  return (
    <AppShell>
      <ChatPage
        initialActiveSessionId={activeSession?.id ?? null}
        initialMessages={activeSession ? getRecentChatHistory(80, activeSession.id) : []}
        initialSessions={sessions}
      />
    </AppShell>
  );
}
