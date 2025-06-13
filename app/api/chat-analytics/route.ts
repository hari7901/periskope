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
  
  // Fixed agent number - only fetch data for this specific agent
  const specificAgent = "+911852701495"; // +91 85270 14950
  
  console.log("[chat-analytics] fetching chats for specific agent:", specificAgent);
  console.log("[chat-analytics] orgPhone filter:", orgPhone || "none");

  try {
    // Fetch all chats and filter for open ones
    const allChats = await fetchAllChats();
    
    // First, let's see how many chats this agent has in total (before open filter)
    const agentChatsBeforeFilter = filterBySpecificAgent(allChats, specificAgent);
    console.log(`[chat-analytics] agent ${specificAgent} has ${agentChatsBeforeFilter.length} total chats (before open filter)`);
    
    const openChats = filterOpenChats(allChats);
    
    console.log(`[chat-analytics] found ${openChats.length} open chats out of ${allChats.length} total chats`);

    // Filter by the specific agent only
    let filteredChats = filterBySpecificAgent(openChats, specificAgent);
    console.log(`[chat-analytics] after agent filter: ${filteredChats.length} chats for agent ${specificAgent}`);

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
    return processChats(filteredChats, specificAgent);
    
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

// Filter chats by the specific agent: +91 85270 14950
function filterBySpecificAgent(chats: Chat[], specificAgent: string): Chat[] {
  // Convert the specific agent number to all possible formats
  const agentFormats = [
    specificAgent, // "+911852701495"
    specificAgent.replace('+', ''), // "911852701495"
    specificAgent.slice(3), // "1852701495" (remove +91)
    specificAgent.slice(1), // "911852701495" (remove +)
    "918527014950", // International format without +
    "+918527014950", // International format with +
    "918527014950@c.us", // WhatsApp format
    "8527014950", // Local format
    "85270 14950", // Formatted display
    "852-701-4950", // Dash format
    "852 701 4950", // Space format
  ];

  console.log("[chat-analytics] looking for agent in formats:", agentFormats);

  let matchedChats = 0;
  const matchDetails: string[] = [];

  const filteredChats = chats.filter(chat => {
    let matched = false;
    let matchedField = '';

    // Check org_phone (primary filter)
    if (chat.org_phone && !matched) {
      const cleanOrgPhone = chat.org_phone.replace(/@c\.us/g, '').replace(/\+/g, '').replace(/[\s-]/g, '');
      if (agentFormats.some(format => {
        const cleanFormat = format.replace(/@c\.us/g, '').replace(/\+/g, '').replace(/[\s-]/g, '');
        return cleanOrgPhone === cleanFormat || 
               cleanOrgPhone.endsWith(cleanFormat) ||
               cleanFormat.endsWith(cleanOrgPhone) ||
               cleanOrgPhone.includes(cleanFormat) ||
               cleanFormat.includes(cleanOrgPhone);
      })) {
        matched = true;
        matchedField = `org_phone: ${chat.org_phone}`;
      }
    }

    // Check chat_org_phones array
    if (chat.chat_org_phones && chat.chat_org_phones.length > 0 && !matched) {
      const hasAgentInOrgPhones = chat.chat_org_phones.some(phone => {
        const cleanPhone = phone.replace(/@c\.us/g, '').replace(/\+/g, '').replace(/[\s-]/g, '');
        return agentFormats.some(format => {
          const cleanFormat = format.replace(/@c\.us/g, '').replace(/\+/g, '').replace(/[\s-]/g, '');
          return cleanPhone === cleanFormat || 
                 cleanPhone.endsWith(cleanFormat) ||
                 cleanFormat.endsWith(cleanPhone) ||
                 cleanPhone.includes(cleanFormat) ||
                 cleanFormat.includes(cleanPhone);
        });
      });
      if (hasAgentInOrgPhones) {
        matched = true;
        matchedField = `chat_org_phones: ${chat.chat_org_phones.join(', ')}`;
      }
    }

    // Check assigned_to
    if (chat.assigned_to && !matched) {
      const cleanAssigned = chat.assigned_to.replace(/@c\.us/g, '').replace(/\+/g, '').replace(/[\s-]/g, '');
      if (agentFormats.some(format => {
        const cleanFormat = format.replace(/@c\.us/g, '').replace(/\+/g, '').replace(/[\s-]/g, '');
        return cleanAssigned === cleanFormat ||
               cleanAssigned.endsWith(cleanFormat) ||
               cleanFormat.endsWith(cleanAssigned) ||
               cleanAssigned.includes(cleanFormat) ||
               cleanFormat.includes(cleanAssigned);
      })) {
        matched = true;
        matchedField = `assigned_to: ${chat.assigned_to}`;
      }
    }

    // Check latest_message sender_phone
    if (chat.latest_message?.sender_phone && !matched) {
      const cleanSender = chat.latest_message.sender_phone.replace(/@c\.us/g, '').replace(/\+/g, '').replace(/[\s-]/g, '');
      if (agentFormats.some(format => {
        const cleanFormat = format.replace(/@c\.us/g, '').replace(/\+/g, '').replace(/[\s-]/g, '');
        return cleanSender === cleanFormat ||
               cleanSender.endsWith(cleanFormat) ||
               cleanFormat.endsWith(cleanSender) ||
               cleanSender.includes(cleanFormat) ||
               cleanFormat.includes(cleanSender);
      })) {
        matched = true;
        matchedField = `latest_message.sender_phone: ${chat.latest_message.sender_phone}`;
      }
    }

    if (matched) {
      matchedChats++;
      matchDetails.push(`${chat.chat_name} (${chat.chat_type}) - matched on ${matchedField}`);
    }

    return matched;
  });

  console.log(`[chat-analytics] Found ${matchedChats} chats matching agent ${specificAgent}`);
  console.log("[chat-analytics] Match details:", matchDetails.slice(0, 5)); // Show first 5 matches

  return filteredChats;
}

// Balanced logic to match Periskope's "open chats" definition
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
    
    // 3. Get chat age and last activity
    const chatCreated = new Date(chat.created_at).getTime();
    const chatAgeInDays = (currentTime - chatCreated) / (24 * 60 * 60 * 1000);
    
    let lastActivityTime = chatCreated;
    if (chat.latest_message?.timestamp) {
      lastActivityTime = new Date(chat.latest_message.timestamp).getTime();
    } else if (chat.updated_at) {
      lastActivityTime = new Date(chat.updated_at).getTime();
    }
    
    const daysSinceLastActivity = (currentTime - lastActivityTime) / (24 * 60 * 60 * 1000);
    
    // 4. Chat type specific filtering with more reasonable thresholds
    if (chat.chat_type === 'business') {
      // Business chats: Keep if created in last 6 months OR activity in last 45 days
      return chatAgeInDays <= 180 || daysSinceLastActivity <= 45;
    }
    
    if (chat.chat_type === 'user') {
      // User chats: Keep if created in last 4 months OR activity in last 30 days
      return chatAgeInDays <= 120 || daysSinceLastActivity <= 30;
    }
    
    if (chat.chat_type === 'group') {
      // Skip empty groups
      if (chat.member_count <= 1) {
        return false;
      }
      
      // Group chats: Keep if created in last 3 months OR activity in last 21 days
      return chatAgeInDays <= 90 || daysSinceLastActivity <= 21;
    }
    
    // 5. Default for unknown chat types
    return chatAgeInDays <= 60 || daysSinceLastActivity <= 30;
  });
}

// Helper function to process chats and calculate metrics
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
      filterApplied: specificAgent 
        ? `Specific agent filter: ${specificAgent} (+91 85270 14950) - excludes only closed, exited, or very old inactive chats`
        : "Inclusive open chat logic - excludes only closed, exited, or very old inactive chats"
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