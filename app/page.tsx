import { AppShell } from "@/components/app/app-shell";
import { ChatPage } from "@/components/chat/chat-page";
import { getRecentChatHistory } from "@/lib/db";

export default function HomePage() {
  return (
    <AppShell>
      <ChatPage initialMessages={getRecentChatHistory()} />
    </AppShell>
  );
}
