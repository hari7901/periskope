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
  const orgPhone = params.get("orgPhone") ?? undefined;
  
  const specificAgent = "+911852701495"; // +91 85270 14950
  
  console.log("[chat-analytics] fetching chats for specific agent:", specificAgent);
  console.log("[chat-analytics] orgPhone filter:", orgPhone || "none");

  try {
    // Fetch all chats and filter for open ones
    const allChats = await fetchAllChats();
    
    console.log(`[chat-analytics] found ${allChats.length} total chats`);

    // First filter for open chats
    const openChats = filterOpenChats(allChats);
    console.log(`[chat-analytics] found ${openChats.length} open chats out of ${allChats.length} total chats`);

    // Filter by orgPhone if specified (this is the main filter for now)
    let filteredChats = openChats;
    if (orgPhone) {
      const orgPhoneWithoutSuffix = orgPhone.replace('@c.us', '');
      const orgPhoneWithSuffix = orgPhone.includes('@c.us') ? orgPhone : `${orgPhone}@c.us`;
      
      filteredChats = filteredChats.filter(chat => {
        return chat.org_phone === orgPhoneWithSuffix || 
               chat.org_phone?.replace('@c.us', '') === orgPhoneWithoutSuffix;
      });
      
      console.log(`[chat-analytics] after orgPhone filter: ${filteredChats.length} chats`);
    }

    // For now, show all group chats (since the agent filter isn't working as expected)
    // TODO: Implement proper agent filtering based on actual chat membership or assignment logic
    const groupChats = filteredChats.filter(chat => chat.chat_type === 'group');
    console.log(`[chat-analytics] showing ${groupChats.length} group chats (agent filtering temporarily disabled)`);

    // Display chat type distribution
    const userChats = filteredChats.filter(chat => chat.chat_type === 'user').length;
    const businessChats = filteredChats.filter(chat => chat.chat_type === 'business').length;
    
    console.log(`[chat-analytics] final chat distribution: groups=${groupChats.length}, users=${userChats}, business=${businessChats}`);

    // Process the filtered chats (using group chats for now)
    return processChats(groupChats, specificAgent);
    
  } catch (error: any) {
    console.error("[chat-analytics] error fetching chat metrics:", error);
    return NextResponse.json(
      { 
        error: "Failed to fetch chat metrics", 
        details: error.message,
        stack: error.stack
      },
      { status: 500 }
    );
  }
}

// Helper function to fetch all chats with pagination
async function fetchAllChats(): Promise<Chat[]> {
  const chatMap = new Map<string, Chat>();
  let hasMoreChats = true;
  let offset = 0;
  const limit = 1000;
  let pageCount = 0;
  
  while (hasMoreChats && pageCount < 15) { // Safety limit
    pageCount++;
    console.log(`[chat-analytics] fetching page ${pageCount} (offset: ${offset})`);
    
    try {
      const response = await periskopeClient.chat.getChats({
        limit,
        offset,
        chat_type: 'group' // Only fetch group chats to optimize
      });
      
      const chats: Chat[] = response.data?.chats || [];
      console.log(`[chat-analytics] page ${pageCount} returned ${chats.length} chats`);
      
      chats.forEach(chat => {
        // Keep the most recent version if duplicate
        if (chatMap.has(chat.chat_id)) {
          const existing = chatMap.get(chat.chat_id)!;
          const existingTime = new Date(existing.updated_at || existing.created_at).getTime();
          const newTime = new Date(chat.updated_at || chat.created_at).getTime();
          if (newTime > existingTime) {
            chatMap.set(chat.chat_id, chat);
          }
        } else {
          chatMap.set(chat.chat_id, chat);
        }
      });
      
      if (chats.length < limit) {
        hasMoreChats = false;
        console.log(`[chat-analytics] reached end of chats (${chats.length} < ${limit})`);
      } else {
        offset += limit;
      }
    } catch (error) {
      console.error(`[chat-analytics] error fetching page ${pageCount}:`, error);
      hasMoreChats = false;
    }
  }
  
  const uniqueChats = Array.from(chatMap.values());
  console.log(`[chat-analytics] pagination complete: ${uniqueChats.length} unique chats from ${pageCount} pages`);
  return uniqueChats;
}

// Balanced filter function for active group chats
function filterOpenChats(chats: Chat[]): Chat[] {
  const now = new Date();
  const currentTime = now.getTime();
  
  console.log(`[chat-analytics] filtering ${chats.length} total chats`);
  
  const filtered = chats.filter(chat => {
    // ONLY INCLUDE GROUP CHATS
    if (chat.chat_type !== 'group') {
      return false;
    }
    
    // 1. Skip explicitly closed chats
    if (chat.closed_at) {
      return false;
    }
    
    // 2. Skip if agent has exited the group
    if (chat.is_exited) {
      return false;
    }
    
    // 3. Must have more than 1 member (but allow null member_count)
    if (chat.member_count !== null && chat.member_count <= 1) {
      return false;
    }
    
    // 4. Check for activity - be more lenient with time windows
    let hasActivity = false;
    let activityReason = "";
    
    // Check for message activity (last 3 months)
    if (chat.latest_message?.timestamp) {
      const lastMessageTime = new Date(chat.latest_message.timestamp).getTime();
      const threeMonthsAgo = currentTime - (90 * 24 * 60 * 60 * 1000);
      if (lastMessageTime > threeMonthsAgo) {
        hasActivity = true;
        const daysAgo = Math.round((currentTime - lastMessageTime) / (24 * 60 * 60 * 1000));
        activityReason = `recent message (${daysAgo} days ago)`;
      }
    }
    
    // If no recent messages, check if chat was created recently (last 30 days)
    if (!hasActivity) {
      const chatCreated = new Date(chat.created_at).getTime();
      const thirtyDaysAgo = currentTime - (30 * 24 * 60 * 60 * 1000);
      if (chatCreated > thirtyDaysAgo) {
        hasActivity = true;
        const daysAgo = Math.round((currentTime - chatCreated) / (24 * 60 * 60 * 1000));
        activityReason = `recently created (${daysAgo} days ago)`;
      }
    }
    
    // If still no activity, check for recent updates (last 30 days)
    if (!hasActivity && chat.updated_at) {
      const updatedTime = new Date(chat.updated_at).getTime();
      const thirtyDaysAgo = currentTime - (30 * 24 * 60 * 60 * 1000);
      if (updatedTime > thirtyDaysAgo) {
        hasActivity = true;
        const daysAgo = Math.round((currentTime - updatedTime) / (24 * 60 * 60 * 1000));
        activityReason = `recently updated (${daysAgo} days ago)`;
      }
    }
    
    // If still no activity, but member count is good and not too old, include it
    if (!hasActivity && chat.member_count && chat.member_count > 1) {
      const chatCreated = new Date(chat.created_at).getTime();
      const sixMonthsAgo = currentTime - (180 * 24 * 60 * 60 * 1000);
      if (chatCreated > sixMonthsAgo) {
        hasActivity = true;
        const daysAgo = Math.round((currentTime - chatCreated) / (24 * 60 * 60 * 1000));
        activityReason = `active group created ${daysAgo} days ago`;
      }
    }
    
    if (hasActivity) {
      console.log(`[chat-analytics] ✓ including: ${chat.chat_name} (${chat.member_count} members) - ${activityReason}`);
    }
    
    return hasActivity;
  });
  
  console.log(`[chat-analytics] filtered to ${filtered.length} open chats`);
  
  // If we have too many, prioritize by recent activity
  if (filtered.length > 100) {
    console.log(`[chat-analytics] too many chats (${filtered.length}), sorting by recent activity`);
    
    const sortedByActivity = filtered.sort((a, b) => {
      const aTime = a.latest_message?.timestamp 
        ? new Date(a.latest_message.timestamp).getTime()
        : new Date(a.updated_at || a.created_at).getTime();
      const bTime = b.latest_message?.timestamp 
        ? new Date(b.latest_message.timestamp).getTime()
        : new Date(b.updated_at || b.created_at).getTime();
      return bTime - aTime; // Most recent first
    });
    
    // Take top 80 most recently active
    const limited = sortedByActivity.slice(0, 80);
    console.log(`[chat-analytics] limited to top ${limited.length} most recently active chats`);
    return limited;
  }
  
  return filtered;
}

function processChats(chats: Chat[], specificAgent?: string) {
  const now = new Date();
  const currentTime = now.getTime();

  const totalOpenChats = chats.length;
  let totalAgeMs = 0;
  let maxAgeMs = 0;
  let chatsWithDelayedResponse = 0;
  let validAgeCount = 0;

  const openChatDetails: DetailedChatInfo[] = [];
  const delayedResponseDetails: any[] = [];

  chats.forEach((chat) => {
    // Calculate age and urgency
    const { ageMs, ageInHours, lastActivityTime, urgencyLevel, requiresResponse } = calculateChatUrgency(chat, currentTime);
    
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
      delayedResponseDetails.push({
        chatId: chat.chat_id,
        chatName: chat.chat_name,
        chatType: chat.chat_type,
        lastMessageTime: chat.latest_message?.timestamp || chat.updated_at,
        hoursWithoutResponse: ageInHours,
        agentPhone: chat.assigned_to,
        lastMessageFromCustomer: chat.latest_message ? !chat.latest_message.from_me : false,
        memberCount: chat.member_count || 0,
        orgPhone: chat.org_phone || null,
        urgencyLevel: urgencyLevel
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
    totalOpenChats,
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
        user: chats.filter((c) => c.chat_type === "user").length,
        group: chats.filter((c) => c.chat_type === "group").length,
        business: chats.filter((c) => c.chat_type === "business").length,
      },
      filterApplied: specificAgent 
        ? `GROUP CHATS ONLY - agent filter temporarily disabled. Showing all group chats.`
        : "GROUP CHATS ONLY - showing all group chats"
    },
  };

  console.log("[chat-analytics] processed metrics:", {
    totalOpenChats,
    averageAgeInHours,
    maxAgeInHours,
    chatsWithDelayedResponse,
    validActivityChats: validAgeCount
  });

  return NextResponse.json({ metrics });
}

// Calculate chat urgency and response requirements with more realistic thresholds
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

  // More realistic response requirements for group chats
  if (chat.latest_message) {
    const isLastMessageFromCustomer = !chat.latest_message.from_me;
    
    if (isLastMessageFromCustomer) {
      // Group chats: response needed within 72 hours (3 days)
      if (ageInHours > 72) {
        requiresResponse = true;
        urgencyLevel = ageInHours > 168 ? "critical" : ageInHours > 120 ? "high" : "medium"; // 120h = 5 days
      }
    }
  } else {
    // No messages yet - new group needs attention
    if (ageInHours > 72) { // 3 days
      requiresResponse = true;
      urgencyLevel = "medium";
    }
  }

  if (ageInHours > 168) urgencyLevel = "critical"; 
  else if (ageInHours > 120) urgencyLevel = "high"; 
  else if (ageInHours > 72) urgencyLevel = "medium"; 
  else urgencyLevel = "low";

  return {
    ageMs,
    ageInHours: Math.round(ageInHours * 100) / 100,
    lastActivityTime,
    urgencyLevel,
    requiresResponse
  };
}