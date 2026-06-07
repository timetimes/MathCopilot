import type { ChatMessage } from '@/types';

const STORAGE_KEY = 'mathcopilot_conversations';

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  conversationId?: string;
  createdAt: number;
  updatedAt: number;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function generateTitle(messages: ChatMessage[]): string {
  const firstUserMsg = messages.find(m => m.role === 'user');
  if (!firstUserMsg) return 'New Chat';
  const text = firstUserMsg.content.replace(/\n/g, ' ').trim();
  return text.length > 30 ? text.slice(0, 30) + '...' : text;
}

export function loadConversations(): Conversation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list: Conversation[] = JSON.parse(raw);
    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function saveConversations(list: Conversation[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch { /* ignore */ }
}

export function createConversation(firstMessage?: ChatMessage): Conversation {
  const messages = firstMessage ? [firstMessage] : [];
  const now = Date.now();
  const conv: Conversation = {
    id: generateId(),
    title: firstMessage ? generateTitle(messages) : 'New Chat',
    messages,
    createdAt: now,
    updatedAt: now,
  };
  const list = loadConversations();
  list.unshift(conv);
  saveConversations(list);
  return conv;
}

export function updateConversation(
  id: string,
  updates: Partial<Pick<Conversation, 'messages' | 'conversationId' | 'title'>>,
): Conversation | null {
  const list = loadConversations();
  const idx = list.findIndex(c => c.id === id);
  if (idx === -1) return null;
  const conv = list[idx];
  if (updates.messages !== undefined) {
    conv.messages = updates.messages;
    conv.title = generateTitle(updates.messages);
  }
  if (updates.conversationId !== undefined) conv.conversationId = updates.conversationId;
  if (updates.title !== undefined) conv.title = updates.title;
  conv.updatedAt = Date.now();
  list[idx] = conv;
  saveConversations(list);
  return conv;
}

export function deleteConversation(id: string): void {
  const list = loadConversations().filter(c => c.id !== id);
  saveConversations(list);
}

export function renameConversation(id: string, title: string): Conversation | null {
  return updateConversation(id, { title });
}
