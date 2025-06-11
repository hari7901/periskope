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
  
  console.log("[chat-analytics] fetching chats for orgPhone:", orgPhone || "all");

  try {
    // Fetch all chats and filter for open ones
    const allChats = await fetchAllChats();
    const openChats = filterOpenChats(allChats);
    
    console.log(`[chat-analytics] found ${openChats.length} open chats out of ${allChats.length} total chats`);

    // Filter by your 4 specific agents and orgPhone
    let filteredChats = filterByAgents(openChats);
    console.log(`[chat-analytics] after agent filter: ${filteredChats.length} chats for your 4 agents`);

    // Filter by orgPhone if specified
    if (orgPhone) {
      const orgPhoneWithoutSuffix = orgPhone.replace('@c.us', '');
      const orgPhoneWithSuffix = orgPhone.includes('@c.us') ? orgPhone : `${orgPhone}@c.us`;
      
      filteredChats = filteredChats.filter(chat => {
        return chat.org_phone === orgPhoneWithSuffix || 
               chat.org_phone?.replace('@c.us', '') === orgPhoneWithoutSuffix;
      });
      
      console.log(`[chat-analytics] after orgPhone filter: ${filteredChats.length} chats`);
    }

    // Display chat type distribution
    const userChats = filteredChats.filter(chat => chat.chat_type === 'user').length;
    const groupChats = filteredChats.filter(chat => chat.chat_type === 'group').length;
    const businessChats = filteredChats.filter(chat => chat.chat_type === 'business').length;
    
    console.log(`[chat-analytics] final chat distribution: user=${userChats}, group=${groupChats}, business=${businessChats}`);

    // Process the filtered chats
    return processChats(filteredChats);
    
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
  
  while (hasMoreChats && pageCount < 15) { // Increased safety limit
    pageCount++;
    console.log(`[chat-analytics] fetching page ${pageCount} (offset: ${offset})`);
    
    try {
      const response = await periskopeClient.chat.getChats({
        limit,
        offset
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

// Filter chats by your 4 specific agents
function filterByAgents(chats: Chat[]): Chat[] {
  // Your 4 agent phone numbers in different formats
  const agentPhones = [
    "+911852743922", "911852743922", "1852743922", "918527439222", "+918527439222", "918527439222@c.us",
    "+911852703388", "911852703388", "1852703388", "918527033886", "+918527033886", "918527033886@c.us", 
    "+911730346174", "911730346174", "1730346174", "917303461744", "+917303461744", "917303461744@c.us",
    "+911852701495", "911852701495", "1852701495", "918527014950", "+918527014950", "918527014950@c.us"
  ];

  return chats.filter(chat => {
    // Check org_phone (primary filter)
    if (chat.org_phone) {
      const cleanOrgPhone = chat.org_phone.replace('@c.us', '');
      if (agentPhones.some(agent => {
        const cleanAgent = agent.replace('@c.us', '').replace('+', '');
        const cleanOrgPhoneForMatch = cleanOrgPhone.replace('+', '');
        return cleanOrgPhoneForMatch === cleanAgent || 
               cleanOrgPhoneForMatch.endsWith(cleanAgent) ||
               cleanAgent.endsWith(cleanOrgPhoneForMatch);
      })) {
        return true;
      }
    }

    // Check chat_org_phones array
    if (chat.chat_org_phones && chat.chat_org_phones.length > 0) {
      const hasAgentInOrgPhones = chat.chat_org_phones.some(phone => {
        const cleanPhone = phone.replace('@c.us', '').replace('+', '');
        return agentPhones.some(agent => {
          const cleanAgent = agent.replace('@c.us', '').replace('+', '');
          return cleanPhone === cleanAgent || 
                 cleanPhone.endsWith(cleanAgent) ||
                 cleanAgent.endsWith(cleanPhone);
        });
      });
      if (hasAgentInOrgPhones) {
        return true;
      }
    }

    // Check assigned_to
    if (chat.assigned_to) {
      const cleanAssigned = chat.assigned_to.replace('@c.us', '').replace('+', '');
      if (agentPhones.some(agent => {
        const cleanAgent = agent.replace('@c.us', '').replace('+', '');
        return cleanAssigned === cleanAgent ||
               cleanAssigned.endsWith(cleanAgent) ||
               cleanAgent.endsWith(cleanAssigned);
      })) {
        return true;
      }
    }

    // Check latest_message sender_phone
    if (chat.latest_message?.sender_phone) {
      const cleanSender = chat.latest_message.sender_phone.replace('@c.us', '').replace('+', '');
      if (agentPhones.some(agent => {
        const cleanAgent = agent.replace('@c.us', '').replace('+', '');
        return cleanSender === cleanAgent ||
               cleanSender.endsWith(cleanAgent) ||
               cleanAgent.endsWith(cleanSender);
      })) {
        return true;
      }
    }

    return false;
  });
}

// More inclusive logic to determine which chats are "open" 
function filterOpenChats(chats: Chat[]): Chat[] {
  const now = new Date();
  const currentTime = now.getTime();
  
  return chats.filter(chat => {
    // 1. Skip explicitly closed chats
    if (chat.closed_at) {
      return false;
    }
    
    // 2. Skip if agent has exited the group (for groups only)
    if (chat.chat_type === 'group' && chat.is_exited) {
      return false;
    }
    
    // 3. For very old chats (3+ months), only keep if recent activity
    const chatCreated = new Date(chat.created_at).getTime();
    const threeMonthsAgo = currentTime - (90 * 24 * 60 * 60 * 1000); // 3 months
    
    if (chatCreated < threeMonthsAgo) {
      // For old chats, only keep if they have messages in last 14 days
      if (chat.latest_message?.timestamp) {
        const lastMessageTime = new Date(chat.latest_message.timestamp).getTime();
        const fourteenDaysAgo = currentTime - (14 * 24 * 60 * 60 * 1000);
        if (lastMessageTime < fourteenDaysAgo) {
          return false; // Old chat with no recent messages
        }
      } else {
        return false; // Old chat with no messages at all
      }
    }
    
    // 4. Include all other chats - this is much more inclusive
    // Most chats created in the last 3 months are considered "open"
    // unless explicitly closed or the agent has exited
    
    return true;
  });
}

// Helper function to process chats and calculate metrics
function processChats(chats: Chat[]) {
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

    // Check if requires response (delayed) - more realistic thresholds
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
      filterApplied: "Inclusive open chat logic - excludes only closed, exited, or very old inactive chats"
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

  // More realistic response requirements
  if (chat.latest_message) {
    const isLastMessageFromCustomer = !chat.latest_message.from_me;
    
    if (isLastMessageFromCustomer) {
      if (chat.chat_type === 'business') {
        // Business chats: response needed within 24 hours (more realistic)
        if (ageInHours > 24) {
          requiresResponse = true;
          urgencyLevel = ageInHours > 72 ? "critical" : ageInHours > 48 ? "high" : "medium";
        }
      } else if (chat.chat_type === 'user') {
        // User chats: response needed within 48 hours
        if (ageInHours > 48) {
          requiresResponse = true;
          urgencyLevel = ageInHours > 168 ? "critical" : ageInHours > 72 ? "high" : "medium"; // 168h = 1 week
        }
      } else if (chat.chat_type === 'group') {
        // Group chats: response needed within 72 hours (3 days)
        if (ageInHours > 72) {
          requiresResponse = true;
          urgencyLevel = ageInHours > 168 ? "critical" : ageInHours > 120 ? "high" : "medium"; // 120h = 5 days
        }
      }
    }
  } else {
    // No messages yet - new chat needs attention (more lenient)
    if (chat.chat_type === 'business' && ageInHours > 48) { // 2 days instead of 2 hours
      requiresResponse = true;
      urgencyLevel = "medium";
    } else if (chat.chat_type === 'user' && ageInHours > 72) { // 3 days instead of 4 hours
      requiresResponse = true;
      urgencyLevel = "medium";
    }
  }

  // Overall urgency based on age (more realistic thresholds)
  if (ageInHours > 168) urgencyLevel = "critical"; // 1 week
  else if (ageInHours > 120) urgencyLevel = "high"; // 5 days
  else if (ageInHours > 72) urgencyLevel = "medium"; // 3 days
  else urgencyLevel = "low";

  return {
    ageMs,
    ageInHours: Math.round(ageInHours * 100) / 100,
    lastActivityTime,
    urgencyLevel,
    requiresResponse
  };
}