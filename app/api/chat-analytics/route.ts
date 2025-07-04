// app/api/chat-analytics/route.ts
import { NextRequest, NextResponse } from "next/server";
import { periskopeClient } from "@/app/lib/periskope";
import type { Chat, ChatMetrics } from "@/app/lib/types/periskope";

// Extended interface for detailed chat info
interface DetailedChatInfo {
  chatId: string;
  chatName: string;
  ageInHours: number;
  chatType?: string;
  agentPhone?: string | null;
  lastActivity?: string;
  orgPhone?: string | null;
  memberCount?: number;
  isAssigned?: boolean;
  lastMessageFromCustomer?: boolean;
  requiresResponse?: boolean;
  urgencyLevel?: string;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  
  // Target agent phone number
  const targetAgent = "918527014950@c.us";
  
  console.log("[chat-analytics] Starting chat analytics for agent:", targetAgent);
  console.log("[chat-analytics] Using timestamp-based open/closed filtering");

  try {
    // Fetch all group chats and filter by org_phone client-side
    const agentChats = await fetchChatsByOrgPhone(targetAgent);
    console.log(`[chat-analytics] Found ${agentChats.length} group chats with org_phone ${targetAgent}`);

    // Filter for truly open chats using timestamp comparison
    const openChats = filterForOpenChats(agentChats);
    console.log(`[chat-analytics] FINAL RESULT: ${openChats.length} truly open chats after timestamp filtering`);

    // Process the results
    const metrics = processChatsToMetrics(openChats, targetAgent);

    return NextResponse.json({ metrics });
    
  } catch (error: any) {
    console.error("[chat-analytics] Error:", error);
    return NextResponse.json(
      { 
        error: "Failed to fetch chat metrics", 
        details: error.message 
      },
      { status: 500 }
    );
  }
}

// Fetch all group chats and filter by org_phone client-side
async function fetchChatsByOrgPhone(targetAgent: string): Promise<Chat[]> {
  const agentChatsMap = new Map<string, Chat>(); // Use Map to prevent duplicates
  let hasMore = true;
  let offset = 0;
  const limit = 1000;
  let totalChatsChecked = 0;
  let totalChatsWithAgent = 0;

  console.log(`[chat-analytics] Fetching ALL group chats and filtering client-side for org_phone: ${targetAgent}`);

  while (hasMore && offset < 10000) { // Safety limit
    try {
      console.log(`[chat-analytics] Fetching page at offset ${offset}`);
      
      const response = await periskopeClient.chat.getChats({
        limit,
        offset,
        chat_type: 'group' // Only fetch group chats, no other filters
      });

      const pageChats: Chat[] = response.data?.chats || [];
      totalChatsChecked += pageChats.length;
      
      console.log(`[chat-analytics] Page returned ${pageChats.length} group chats`);

      // Filter chats by org_phone client-side and prevent duplicates
      pageChats.forEach(chat => {
        if (chat.org_phone === targetAgent) {
          // Use chat_id as unique key to prevent duplicates
          if (!agentChatsMap.has(chat.chat_id)) {
            agentChatsMap.set(chat.chat_id, chat);
            totalChatsWithAgent++;
          }
        }
      });

      console.log(`[chat-analytics] Filtered page: ${agentChatsMap.size} unique chats so far with org_phone ${targetAgent}`);

      if (pageChats.length < limit) {
        hasMore = false;
        console.log(`[chat-analytics] Reached end of results (${pageChats.length} < ${limit})`);
      } else {
        offset += limit;
      }
    } catch (error) {
      console.error("[chat-analytics] API call failed:", error);
      hasMore = false;
    }
  }

  const agentChats = Array.from(agentChatsMap.values());
  console.log(`[chat-analytics] SUMMARY: Checked ${totalChatsChecked} total group chats, found ${agentChats.length} unique chats with org_phone ${targetAgent}`);
  
  return agentChats;
}

// NEW: Timestamp-based open/closed filtering function
function filterForOpenChats(chats: Chat[]): Chat[] {
  console.log(`[TIMESTAMP-FILTER] Starting timestamp-based filtering for ${chats.length} chats`);

  const openChats = chats.filter((chat, index) => {
    // Skip exited chats
    if (chat.is_exited) {
      if (index < 5) console.log(`[TIMESTAMP-FILTER] ✗ Exited: ${chat.chat_name}`);
      return false;
    }

    // If there's no closed_at, the chat is considered open
    if (!chat.closed_at) {
      if (index < 10) console.log(`[TIMESTAMP-FILTER] ✓ No closed_at (open): ${chat.chat_name}`);
      return true;
    }

    // If there's a closed_at, check if latest message timestamp is greater than closed_at
    if (chat.latest_message?.timestamp) {
      const latestMessageTime = new Date(chat.latest_message.timestamp).getTime();
      const closedAtTime = typeof chat.closed_at === 'number' ? chat.closed_at : new Date(chat.closed_at).getTime();
      
      if (latestMessageTime > closedAtTime) {
        if (index < 10) {
          console.log(`[TIMESTAMP-FILTER] ✓ Reopened by message: ${chat.chat_name}`);
          console.log(`  Latest message: ${new Date(latestMessageTime).toISOString()}`);
          console.log(`  Closed at: ${new Date(closedAtTime).toISOString()}`);
        }
        return true; // Chat was reopened by a message after closure
      } else {
        if (index < 5) {
          console.log(`[TIMESTAMP-FILTER] ✗ Closed (message before closure): ${chat.chat_name}`);
          console.log(`  Latest message: ${new Date(latestMessageTime).toISOString()}`);
          console.log(`  Closed at: ${new Date(closedAtTime).toISOString()}`);
        }
        return false; // Chat is closed and no messages after closure
      }
    } else {
      // No latest message but has closed_at - consider it closed
      if (index < 5) console.log(`[TIMESTAMP-FILTER] ✗ No messages and has closed_at: ${chat.chat_name}`);
      return false;
    }
  });

  console.log(`[TIMESTAMP-FILTER] RESULT: Found ${openChats.length} truly open chats based on timestamp comparison`);
  
  // Log some examples for debugging
  console.log(`[TIMESTAMP-FILTER] Examples of filtering decisions:`);
  chats.slice(0, 3).forEach(chat => {
    const isOpen = openChats.includes(chat);
    const hasClosedAt = !!chat.closed_at;
    const hasLatestMessage = !!chat.latest_message?.timestamp;
    
    console.log(`  ${chat.chat_name}: ${isOpen ? 'OPEN' : 'CLOSED'}`);
    console.log(`    - closed_at: ${hasClosedAt ? new Date(chat.closed_at!).toISOString() : 'null'}`);
    console.log(`    - latest_message: ${hasLatestMessage ? new Date(chat.latest_message!.timestamp).toISOString() : 'null'}`);
    
    if (hasClosedAt && hasLatestMessage) {
      const latestMessageTime = new Date(chat.latest_message!.timestamp).getTime();
      const closedAtTime = typeof chat.closed_at === 'number' ? chat.closed_at : new Date(chat.closed_at!).getTime();
      console.log(`    - message > closed_at: ${latestMessageTime > closedAtTime}`);
    }
  });

  return openChats;
}

// Streamlined metrics processing
function processChatsToMetrics(chats: Chat[], targetAgent: string): ChatMetrics {
  const now = new Date();
  const currentTime = now.getTime();

  let totalAgeMs = 0;
  let maxAgeMs = 0;
  let chatsWithDelayedResponse = 0;
  let validAgeCount = 0;

  const openChatDetails: DetailedChatInfo[] = [];
  const delayedResponseDetails: any[] = [];

  chats.forEach((chat) => {
    const { ageMs, ageInHours, lastActivityTime, urgencyLevel, requiresResponse } = 
      calculateChatUrgency(chat, currentTime);

    // Update aggregates
    if (ageMs >= 0) {
      totalAgeMs += ageMs;
      validAgeCount++;
      if (ageMs > maxAgeMs) {
        maxAgeMs = ageMs;
      }
    }

    if (requiresResponse) {
      chatsWithDelayedResponse++;
      
      // Calculate hours since customer's last message for delayed response details
      let hoursWithoutResponse = ageInHours;
      if (chat.latest_message?.timestamp) {
        const lastMessageTime = new Date(chat.latest_message.timestamp).getTime();
        hoursWithoutResponse = (currentTime - lastMessageTime) / (1000 * 60 * 60);
      }
      
      delayedResponseDetails.push({
        chatId: chat.chat_id,
        chatName: chat.chat_name,
        chatType: chat.chat_type,
        lastMessageTime: chat.latest_message?.timestamp || chat.updated_at,
        hoursWithoutResponse: Math.round(hoursWithoutResponse * 100) / 100,
        agentPhone: chat.assigned_to,
        lastMessageFromCustomer: chat.latest_message ? !chat.latest_message.from_me : false,
        memberCount: chat.member_count || 0,
        orgPhone: chat.org_phone || null,
        urgencyLevel: urgencyLevel,
        lastMessageBody: chat.latest_message?.body ? 
          (chat.latest_message.body.length > 100 ? 
            chat.latest_message.body.substring(0, 100) + "..." : 
            chat.latest_message.body) : null
      });
    }

    // Add to open chat details
    openChatDetails.push({
      chatId: chat.chat_id,
      chatName: chat.chat_name,
      ageInHours: ageInHours,
      chatType: chat.chat_type,
      agentPhone: chat.assigned_to,
      lastActivity: new Date(lastActivityTime).toISOString(),
      memberCount: chat.member_count || 0,
      isAssigned: !!chat.assigned_to,
      orgPhone: chat.org_phone || null,
      lastMessageFromCustomer: chat.latest_message ? !chat.latest_message.from_me : false,
      requiresResponse: requiresResponse,
      urgencyLevel: urgencyLevel
    });
  });

  // Calculate averages
  const averageAgeInHours = validAgeCount > 0 
    ? Math.round((totalAgeMs / validAgeCount / (1000 * 60 * 60)) * 100) / 100
    : 0;
  const maxAgeInHours = Math.round((maxAgeMs / (1000 * 60 * 60)) * 100) / 100;

  const metrics: ChatMetrics = {
    totalOpenChats: chats.length,
    averageAgeInHours,
    maxAgeInHours,
    chatsWithDelayedResponse,
    openChatDetails: openChatDetails.sort((a, b) => b.ageInHours - a.ageInHours),
    delayedResponseDetails: delayedResponseDetails.sort((a, b) => b.hoursWithoutResponse - a.hoursWithoutResponse),
    _debug: {
      periskopePhone: process.env.NEXT_PUBLIC_PERISKOPE_PHONE,
      hasApiKey: !!process.env.NEXT_PUBLIC_PERISKOPE_API_KEY,
      totalChatsFound: chats.length,
      validActivityChats: validAgeCount,
      chatTypeDistribution: {
        user: 0,
        group: chats.length,
        business: 0,
      },
      filterApplied: `Timestamp-based filtering: latest_message.timestamp > closed_at = OPEN, else CLOSED`
    },
  };

  console.log("[chat-analytics] PROCESSING COMPLETE:", {
    totalOpenChats: metrics.totalOpenChats,
    averageAgeInHours: metrics.averageAgeInHours,
    maxAgeInHours: metrics.maxAgeInHours,
    chatsWithDelayedResponse: metrics.chatsWithDelayedResponse,
    overdueBreakdown: delayedResponseDetails.reduce((acc, chat) => {
      if (chat.hoursWithoutResponse > 168) acc.critical++;
      else if (chat.hoursWithoutResponse > 72) acc.high++;
      else if (chat.hoursWithoutResponse > 48) acc.medium++;
      else acc.low++;
      return acc;
    }, { critical: 0, high: 0, medium: 0, low: 0 })
  });

  return metrics;
}

// Enhanced urgency calculation - Check conversation flow for overdue status
function calculateChatUrgency(chat: Chat, currentTime: number) {
  let lastActivityTime: number;
  let ageMs: number;
  let requiresResponse = false;
  let urgencyLevel = "low";

  // Determine last activity time
  if (chat.latest_message?.timestamp) {
    lastActivityTime = new Date(chat.latest_message.timestamp).getTime();
  } else if (chat.updated_at) {
    lastActivityTime = new Date(chat.updated_at).getTime();
  } else {
    lastActivityTime = new Date(chat.created_at).getTime();
  }

  ageMs = currentTime - lastActivityTime;
  const ageInHours = ageMs / (1000 * 60 * 60);

  // DEBUGGING: Log every chat evaluation
  console.log(`\n=== CHAT EVALUATION: ${chat.chat_name} ===`);
  console.log(`Chat ID: ${chat.chat_id}`);
  console.log(`Has latest_message: ${!!chat.latest_message}`);
  
  if (chat.latest_message) {
    console.log(`from_me: ${chat.latest_message.from_me}`);
    console.log(`sender_phone: ${chat.latest_message.sender_phone}`);
    console.log(`org_phone: ${chat.org_phone}`);
    console.log(`timestamp: ${chat.latest_message.timestamp}`);
    console.log(`hours since message: ${Math.round(((currentTime - new Date(chat.latest_message.timestamp).getTime()) / (1000 * 60 * 60)) * 100) / 100}`);
  }

  // CORRECT overdue logic - Based on conversation flow
  if (chat.latest_message) {
    const lastMessageTime = new Date(chat.latest_message.timestamp).getTime();
    const hoursSinceLastMessage = (currentTime - lastMessageTime) / (1000 * 60 * 60);
    
    // Get the exact from_me value
    const fromMeValue = chat.latest_message.from_me;
    
    console.log(`fromMeValue type: ${typeof fromMeValue}, value: ${fromMeValue}`);

    // RULE 1: If latest message is from us (from_me: true) - NOT overdue
    // This means we responded after customer's message
    if (fromMeValue === true) {
      requiresResponse = false;
      urgencyLevel = "low";
      console.log(`RESULT: NOT OVERDUE - We responded (from_me: true)`);
      console.log(`=====================================\n`);
      
      return {
        ageMs,
        ageInHours: Math.round(ageInHours * 100) / 100,
        lastActivityTime,
        urgencyLevel,
        requiresResponse
      };
    }

    // RULE 2: If latest message is from customer (from_me: false) - OVERDUE
    // This means customer sent message and we haven't responded yet
    if (fromMeValue === false) {
      requiresResponse = true;
      
      // Set urgency based on how long customer has been waiting for our response
      if (hoursSinceLastMessage > 168) urgencyLevel = "critical"; // 7+ days
      else if (hoursSinceLastMessage > 72) urgencyLevel = "high"; // 3+ days  
      else if (hoursSinceLastMessage > 48) urgencyLevel = "medium"; // 2+ days
      else urgencyLevel = "low"; // 0-2 days
      
      console.log(`RESULT: OVERDUE - Customer waiting for our response ${Math.round(hoursSinceLastMessage)}h (from_me: false)`);
      console.log(`=====================================\n`);
    } else {
      // Any unclear case - default to NOT overdue
      requiresResponse = false;
      urgencyLevel = "low";
      console.log(`RESULT: NOT OVERDUE - Unclear case (from_me: ${fromMeValue})`);
      console.log(`=====================================\n`);
    }
  } else {
    // No messages - never overdue
    requiresResponse = false;
    urgencyLevel = "low";
    console.log(`RESULT: NOT OVERDUE - No messages in chat`);
    console.log(`=====================================\n`);
  }

  return {
    ageMs,
    ageInHours: Math.round(ageInHours * 100) / 100,
    lastActivityTime,
    urgencyLevel,
    requiresResponse
  };
}