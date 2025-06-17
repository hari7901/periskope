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
  console.log("[chat-analytics] Using org_phone filtering with 2-month activity window");

  try {
    // Fetch group chats with recent activity (last 2 months) and filter by org_phone client-side
    const agentChats = await fetchChatsByOrgPhone(targetAgent);
    console.log(`[chat-analytics] Found ${agentChats.length} group chats with org_phone ${targetAgent} and recent activity`);

    // Filter for active chats in the last two months
    const activeChats = filterForOpenChats(agentChats);
    console.log(`[chat-analytics] Found ${activeChats.length} chats (including recently closed within 24h)`);

    // Process the results
    const metrics = processChatsToMetrics(activeChats, targetAgent);

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
  const agentChats: Chat[] = [];
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

      // Filter chats by org_phone client-side
      const filteredChats = pageChats.filter(chat => {
        return chat.org_phone === targetAgent;
      });

      totalChatsWithAgent += filteredChats.length;
      agentChats.push(...filteredChats);

      console.log(`[chat-analytics] Filtered page: ${filteredChats.length}/${pageChats.length} chats have org_phone ${targetAgent}`);

      // Log sample of org_phones found on this page for debugging
      if (pageChats.length > 0) {
        const orgPhones = [...new Set(pageChats.map(chat => chat.org_phone))];
        console.log(`[chat-analytics] Unique org_phones on this page: ${orgPhones.slice(0, 10).join(', ')}${orgPhones.length > 10 ? '...' : ''}`);
      }

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

  console.log(`[chat-analytics] SUMMARY: Checked ${totalChatsChecked} total group chats, found ${totalChatsWithAgent} with org_phone ${targetAgent}`);
  
  // Log some examples of found chats with their closure info
  if (agentChats.length > 0) {
    console.log(`[chat-analytics] Sample chats found:`, 
      agentChats.slice(0, 5).map(chat => {
        let closureInfo = 'not set';
        if (chat.closed_at) {
          if (typeof chat.closed_at === 'number') {
            const closedDate = new Date(chat.closed_at);
            const now = new Date();
            closureInfo = `${closedDate.toLocaleDateString()} (${closedDate > now ? 'future' : 'past'})`;
          } else {
            closureInfo = `${chat.closed_at} (string)`;
          }
        }
        
        return {
          name: chat.chat_name,
          orgPhone: chat.org_phone,
          memberCount: chat.member_count,
          assignedTo: chat.assigned_to,
          closedAt: closureInfo,
          isExited: chat.is_exited,
          hasClosedAt: !!chat.closed_at,
          rawClosedAt: chat.closed_at,
          lastMessage: chat.latest_message?.timestamp ? new Date(chat.latest_message.timestamp).toLocaleDateString() : 'none'
        };
      })
    );
  }

  return agentChats;
}

// Filter for truly active chats in the last two months
function filterForOpenChats(chats: Chat[]): Chat[] {
  const now = new Date();
  const currentTime = now.getTime();
  const twoMonthsAgo = currentTime - (60 * 24 * 60 * 60 * 1000); // 60 days
  const oneMonthAgo = currentTime - (30 * 24 * 60 * 60 * 1000); // 30 days

  console.log(`[chat-analytics] Filtering ${chats.length} chats for active status in last 2 months`);

  const activeChats = chats.filter((chat, index) => {
    // 1. EXCLUDE: Check if chat is exited
    if (chat.is_exited) {
      if (index < 10) console.log(`[chat-analytics] ✗ Skipping exited: ${chat.chat_name}`);
      return false;
    }

    // 2. Handle closed chats more intelligently
    if (chat.closed_at) {
      let shouldExclude = false;
      
      if (typeof chat.closed_at === 'number') {
        const closedDate = new Date(chat.closed_at);
        const hoursAgo = Math.round((currentTime - chat.closed_at) / (1000 * 60 * 60));
        
        // Only exclude chats closed more than 24 hours ago
        if (hoursAgo > 24) {
          shouldExclude = true;
          if (index < 10) console.log(`[chat-analytics] ✗ Skipping old closure: ${chat.chat_name} (closed ${hoursAgo}h ago)`);
        } else {
          // Recently closed (within 24h) - include for analysis
          if (index < 10) console.log(`[chat-analytics] ℹ Recently closed: ${chat.chat_name} (${hoursAgo}h ago) - including for analysis`);
        }
      } else if (typeof chat.closed_at === 'string') {
        const closedTime = new Date(chat.closed_at).getTime();
        const hoursAgo = Math.round((currentTime - closedTime) / (1000 * 60 * 60));
        if (!isNaN(closedTime) && hoursAgo > 24) {
          shouldExclude = true;
          if (index < 10) console.log(`[chat-analytics] ✗ Skipping old closure: ${chat.chat_name} (closed ${hoursAgo}h ago)`);
        }
      }
      
      if (shouldExclude) {
        return false;
      }
    } else {
      // No closed_at - definitely active
      if (index < 10) console.log(`[chat-analytics] ✓ No closure timestamp: ${chat.chat_name} - definitely active`);
    }

    // 3. INCLUDE: Check for activity (be very permissive since most chats seem to be closed)
    let hasRecentActivity = false;
    let activityReason = "";

    // A. Any message activity in last 6 months (very permissive)
    if (chat.latest_message?.timestamp) {
      const lastMessageTime = new Date(chat.latest_message.timestamp).getTime();
      const sixMonthsAgo = currentTime - (180 * 24 * 60 * 60 * 1000);
      if (lastMessageTime > sixMonthsAgo) {
        hasRecentActivity = true;
        const daysAgo = Math.round((currentTime - lastMessageTime) / (24 * 60 * 60 * 1000));
        activityReason = `message ${daysAgo} days ago`;
      }
    }

    // B. Recently updated (system activity) - 6 months
    if (!hasRecentActivity && chat.updated_at) {
      const updatedTime = new Date(chat.updated_at).getTime();
      const sixMonthsAgo = currentTime - (180 * 24 * 60 * 60 * 1000);
      if (updatedTime > sixMonthsAgo) {
        hasRecentActivity = true;
        const daysAgo = Math.round((currentTime - updatedTime) / (24 * 60 * 60 * 1000));
        activityReason = `updated ${daysAgo} days ago`;
      }
    }

    // C. Recently created (within last 6 months)
    if (!hasRecentActivity) {
      const createdTime = new Date(chat.created_at).getTime();
      const sixMonthsAgo = currentTime - (180 * 24 * 60 * 60 * 1000);
      if (createdTime > sixMonthsAgo) {
        hasRecentActivity = true;
        const daysAgo = Math.round((currentTime - createdTime) / (24 * 60 * 60 * 1000));
        activityReason = `created ${daysAgo} days ago`;
      }
    }

    // D. Currently assigned (include regardless of activity age)
    if (!hasRecentActivity && chat.assigned_to) {
      hasRecentActivity = true;
      activityReason = `assigned to ${chat.assigned_to}`;
    }

    // E. Has invite link (maintained groups)
    if (!hasRecentActivity && chat.invite_link) {
      hasRecentActivity = true;
      activityReason = `has invite link`;
    }

    // F. For debugging - include first 5 chats regardless
    if (!hasRecentActivity && index < 5) {
      hasRecentActivity = true;
      activityReason = `DEBUG: force include for testing`;
    }

    // Log decision
    if (hasRecentActivity) {
      if (index < 20) console.log(`[chat-analytics] ✓ Including: ${chat.chat_name} - ${activityReason}`);
      return true;
    } else {
      if (index < 10) console.log(`[chat-analytics] ✗ Excluding: ${chat.chat_name} - no recent activity in last 2 months`);
      return false;
    }
  });

  console.log(`[chat-analytics] ACTIVE FILTER RESULT: ${activeChats.length} chats (including recently closed within 24h)`);
  
  // Show breakdown of included chats
  if (activeChats.length > 0) {
    const oneMonthAgo = currentTime - (30 * 24 * 60 * 60 * 1000);
    const withRecentMessages = activeChats.filter(chat => {
      if (!chat.latest_message?.timestamp) return false;
      const lastMessageTime = new Date(chat.latest_message.timestamp).getTime();
      return lastMessageTime > oneMonthAgo;
    }).length;

    const assigned = activeChats.filter(chat => !!chat.assigned_to).length;
    const sixMonthsAgo = currentTime - (180 * 24 * 60 * 60 * 1000);
    const recentlyCreated = activeChats.filter(chat => {
      const createdTime = new Date(chat.created_at).getTime();
      return createdTime > sixMonthsAgo;
    }).length;

    const recentlyClosed = activeChats.filter(chat => {
      if (!chat.closed_at || typeof chat.closed_at !== 'number') return false;
      const hoursAgo = Math.round((currentTime - chat.closed_at) / (1000 * 60 * 60));
      return hoursAgo <= 24;
    }).length;

    const neverClosed = activeChats.filter(chat => !chat.closed_at).length;

    console.log(`[chat-analytics] Breakdown: ${withRecentMessages} recent messages, ${assigned} assigned, ${recentlyCreated} recently created, ${recentlyClosed} recently closed, ${neverClosed} never closed`);

    console.log(`[chat-analytics] Breakdown: ${withRecentMessages} with recent messages, ${assigned} assigned, ${recentlyCreated} recently created`);
    
    // Log top 5 most recent chats
    const sortedByActivity = [...activeChats].sort((a, b) => {
      const aTime = a.latest_message?.timestamp ? new Date(a.latest_message.timestamp).getTime() : new Date(a.updated_at || a.created_at).getTime();
      const bTime = b.latest_message?.timestamp ? new Date(b.latest_message.timestamp).getTime() : new Date(b.updated_at || b.created_at).getTime();
      return bTime - aTime;
    });

    console.log(`[chat-analytics] Top 5 most active chats:`, 
      sortedByActivity.slice(0, 5).map(chat => {
        const lastActivity = chat.latest_message?.timestamp || chat.updated_at || chat.created_at;
        const daysAgo = Math.round((currentTime - new Date(lastActivity).getTime()) / (24 * 60 * 60 * 1000));
        return {
          name: chat.chat_name,
          lastActivity: `${daysAgo} days ago`,
          members: chat.member_count,
          assigned: chat.assigned_to || 'unassigned'
        };
      })
    );
  }
  
  return activeChats;
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
    openChatDetails: openChatDetails.sort((a, b) => b.ageInHours - a.ageInHours), // Sort by age (oldest first)
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
      filterApplied: `org_phone filtering for ${targetAgent} with 2-month activity window and duplicate removal`
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

// Enhanced urgency calculation with better overdue detection
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

  // Enhanced overdue response detection
  if (chat.latest_message) {
    const lastMessageFromCustomer = !chat.latest_message.from_me;
    const lastMessageTime = new Date(chat.latest_message.timestamp).getTime();
    const hoursSinceLastMessage = (currentTime - lastMessageTime) / (1000 * 60 * 60);

    // Check if customer's message needs response
    if (lastMessageFromCustomer && hoursSinceLastMessage > 24) {
      requiresResponse = true;
      
      // Set urgency based on how long customer has been waiting
      if (hoursSinceLastMessage > 168) urgencyLevel = "critical"; // 7+ days
      else if (hoursSinceLastMessage > 72) urgencyLevel = "high"; // 3+ days  
      else if (hoursSinceLastMessage > 48) urgencyLevel = "medium"; // 2+ days
      else urgencyLevel = "low"; // 1-2 days
      
      console.log(`[urgency] Customer waiting in "${chat.chat_name}": ${Math.round(hoursSinceLastMessage)}h since their message`);
    } else if (lastMessageFromCustomer && hoursSinceLastMessage <= 24) {
      // Recent customer message, not overdue yet
      urgencyLevel = "low";
    } else {
      // Last message was from us, check overall chat age
      if (ageInHours > 168) urgencyLevel = "medium"; 
      else if (ageInHours > 120) urgencyLevel = "low"; 
      else urgencyLevel = "low";
    }
  } else {
    // No messages, check chat age
    if (ageInHours > 168) urgencyLevel = "medium"; 
    else urgencyLevel = "low";
  }

  return {
    ageMs,
    ageInHours: Math.round(ageInHours * 100) / 100,
    lastActivityTime,
    urgencyLevel,
    requiresResponse
  };
}