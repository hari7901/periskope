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
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const chatType = params.get("chatType") ?? undefined;
  const agent = params.get("agent") ?? undefined;
  const orgPhone = params.get("orgPhone") ?? undefined;
  
  // Get filter state - default is true for open chats filter
  const filterOpen = params.get("filterOpen") !== "false"; // Default: true (only open chats)
  
  // Get time filter
  const timeFilter = params.get("timeFilter") ?? "all"; // Options: "day", "week", "month", "all"
  
  console.log("[chat-analytics] fetching chats with filters:", {
    chatType: chatType || "all",
    agent: agent || "all",
    orgPhone: orgPhone || "all",
    filterOpen,
    timeFilter
  });

  try {
    // Fetch all chats with pagination and deduplication
    const allChats = await fetchAllChatsWithDeduplication(chatType);
    
    console.log(`[chat-analytics] successfully fetched ${allChats.length} unique chats across all pages`);

    // Apply filters sequentially to make it easier to track the effect of each filter
    
    // 1. Filter by open status if requested
    let filteredChats = filterOpen 
      ? allChats.filter(chat => !chat.closed_at)
      : allChats;
    
    console.log(`[chat-analytics] after open filter: ${filteredChats.length} chats`);
    
    // 2. Apply time filter
    if (timeFilter !== "all") {
      const now = new Date();
      let cutoffDate = new Date();
      
      switch (timeFilter) {
        case "day":
          cutoffDate.setDate(now.getDate() - 1); // Last 24 hours
          break;
        case "week":
          cutoffDate.setDate(now.getDate() - 7); // Last 7 days
          break;
        case "month":
          cutoffDate.setMonth(now.getMonth() - 1); // Last 30 days
          break;
        default:
          // No time filtering
          break;
      }
      
      const cutoffTime = cutoffDate.getTime();
      
      filteredChats = filteredChats.filter(chat => {
        // Use the latest of these timestamps for time filtering
        const lastActivityTime = Math.max(
          chat.latest_message?.timestamp ? new Date(chat.latest_message.timestamp).getTime() : 0,
          chat.updated_at ? new Date(chat.updated_at).getTime() : 0
        );
        
        // Include chat if it has activity after the cutoff time
        return lastActivityTime >= cutoffTime;
      });
      
      console.log(`[chat-analytics] after time filter (${timeFilter}): ${filteredChats.length} chats`);
    }
    
    // 3. Filter by agent if specified
    if (agent) {
      const agentWithoutSuffix = agent.replace('@c.us', '');
      const agentWithSuffix = agent.includes('@c.us') ? agent : `${agent}@c.us`;
      
      filteredChats = filteredChats.filter(chat => {
        // Check org_phone
        const chatOrgPhone = chat.org_phone || '';
        if (chatOrgPhone === agentWithSuffix || chatOrgPhone.replace('@c.us', '') === agentWithoutSuffix) {
          return true;
        }
        
        // Check assigned_to
        if (chat.assigned_to === agentWithoutSuffix || chat.assigned_to === agentWithSuffix) {
          return true;
        }
        
        // Check latest_message sender
        if (chat.latest_message?.sender_phone === agentWithoutSuffix || 
            chat.latest_message?.sender_phone === agentWithSuffix) {
          return true;
        }
        
        // Check chat_org_phones
        if (chat.chat_org_phones && (
            chat.chat_org_phones.includes(agentWithoutSuffix) || 
            chat.chat_org_phones.includes(agentWithSuffix))) {
          return true;
        }
        
        return false;
      });
      
      console.log(`[chat-analytics] after agent filter: ${filteredChats.length} chats`);
    }
    
    // 4. Filter by orgPhone if specified
    if (orgPhone) {
      const orgPhoneWithoutSuffix = orgPhone.replace('@c.us', '');
      const orgPhoneWithSuffix = orgPhone.includes('@c.us') ? orgPhone : `${orgPhone}@c.us`;
      
      filteredChats = filteredChats.filter(chat => {
        return chat.org_phone === orgPhoneWithSuffix || 
               chat.org_phone?.replace('@c.us', '') === orgPhoneWithoutSuffix;
      });
      
      console.log(`[chat-analytics] after orgPhone filter: ${filteredChats.length} chats`);
    }

    // Display chat type distribution of remaining chats
    const userChats = filteredChats.filter(chat => chat.chat_type === 'user').length;
    const groupChats = filteredChats.filter(chat => chat.chat_type === 'group').length;
    const businessChats = filteredChats.filter(chat => chat.chat_type === 'business').length;
    
    console.log(`[chat-analytics] final chat distribution: user=${userChats}, group=${groupChats}, business=${businessChats}`);

    // Process the filtered chats
    return processChats(filteredChats, chatType || 'all', timeFilter);
    
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
  
  // Helper function to fetch all chats with pagination and deduplication
  async function fetchAllChatsWithDeduplication(chatType?: string): Promise<Chat[]> {
    const chatMap = new Map<string, Chat>(); // Use Map for deduplication by chat_id
    let hasMoreChats = true;
    let offset = 0;
    const limit = 1000; // Maximum page size
    let pageCount = 0;
    let duplicatesFound = 0;
    
    while (hasMoreChats) {
      pageCount++;
      console.log(`[chat-analytics] fetching page ${pageCount} (offset: ${offset}, limit: ${limit}${chatType ? `, type: ${chatType}` : ''})`);
      
      // Configure API call options for this page
      const options: any = {
        limit,
        offset
      };
      
      // Add chat type filter if specified at the API level for more efficient filtering
      if (chatType) {
        options.chat_type = chatType;
      }
      
      try {
        // Make the API call to get a page of chats
        const response = await periskopeClient.chat.getChats(options);
        
        // Extract chats from response
        const chats: Chat[] = response.data?.chats || [];
        console.log(`[chat-analytics] page ${pageCount} returned ${chats.length} chats`);
        
        // Add chats to our Map for deduplication
        let newChatsInPage = 0;
        chats.forEach(chat => {
          if (chatMap.has(chat.chat_id)) {
            duplicatesFound++;
            console.log(`[chat-analytics] duplicate chat found: ${chat.chat_id} (${chat.chat_name})`);
            // Keep the most recently updated version
            const existingChat = chatMap.get(chat.chat_id)!;
            const existingUpdated = new Date(existingChat.updated_at || existingChat.created_at).getTime();
            const newUpdated = new Date(chat.updated_at || chat.created_at).getTime();
            
            if (newUpdated > existingUpdated) {
              chatMap.set(chat.chat_id, chat);
              console.log(`[chat-analytics] updated duplicate with newer version: ${chat.chat_id}`);
            }
          } else {
            chatMap.set(chat.chat_id, chat);
            newChatsInPage++;
          }
        });
        
        console.log(`[chat-analytics] page ${pageCount}: ${newChatsInPage} new chats, ${chats.length - newChatsInPage} duplicates`);
        
        // Check if we should fetch more
        if (chats.length < limit) {
          // We got fewer chats than the limit, so we've reached the end
          hasMoreChats = false;
          console.log(`[chat-analytics] reached end of chats (${chats.length} < ${limit})`);
        } else {
          // We got a full page, so there might be more
          offset += limit;
          console.log(`[chat-analytics] continuing to next page, new offset: ${offset}`);
          
          // Safety check: if we've fetched a lot of pages, break to avoid infinite loops
          if (pageCount >= 20) {
            console.log(`[chat-analytics] reached maximum page count (${pageCount}), stopping pagination`);
            hasMoreChats = false;
          }
        }
      } catch (error) {
        console.error(`[chat-analytics] error fetching page ${pageCount}:`, error);
        hasMoreChats = false; // Stop on error
      }
    }
    
    // Convert Map back to array
    const uniqueChats = Array.from(chatMap.values());
    
    console.log(`[chat-analytics] pagination complete: fetched ${pageCount} pages with ${uniqueChats.length} unique chats (${duplicatesFound} duplicates removed)`);
    return uniqueChats;
  }
  
  // Helper function to process chats and calculate metrics
  function processChats(chats: Chat[], filterType: string, timeFilter: string) {
    const now = new Date();
    const currentTime = now.getTime();
    const twentyFourHoursMs = 24 * 60 * 60 * 1000;

    // Calculate metrics for chats
    const totalOpenChats = chats.length;
    let totalAgeMs = 0;
    let maxAgeMs = 0;
    let chatsWithDelayedResponse = 0;

    const openChatDetails: DetailedChatInfo[] = [];
    const delayedResponseDetails: any[] = [];

    chats.forEach((chat) => {
      // Robust age calculation with chat type-specific logic
      let lastActivityTime: number;
      let ageCalculationMethod: string;
      let isValidActivity = false;

      // Priority order for determining last activity time
      const timestamps = {
        latestMessage: chat.latest_message?.timestamp
          ? new Date(chat.latest_message.timestamp).getTime()
          : null,
        updatedAt: chat.updated_at ? new Date(chat.updated_at).getTime() : null,
        createdAt: chat.created_at ? new Date(chat.created_at).getTime() : null,
      };

      // Chat type-specific age calculation logic
      if (chat.chat_type === "user") {
        // For user chats, prioritize latest message as it shows actual conversation activity
        if (timestamps.latestMessage && timestamps.latestMessage > 0) {
          lastActivityTime = timestamps.latestMessage;
          ageCalculationMethod = "latest_message";
          isValidActivity = true;
        } else if (timestamps.updatedAt && timestamps.updatedAt > 0) {
          lastActivityTime = timestamps.updatedAt;
          ageCalculationMethod = "updated_at";
          isValidActivity = true;
        } else if (timestamps.createdAt && timestamps.createdAt > 0) {
          lastActivityTime = timestamps.createdAt;
          ageCalculationMethod = "created_at";
          isValidActivity = false; // Created time doesn't indicate activity
        } else {
          // Fallback to current time minus 1 hour as default
          lastActivityTime = currentTime - 60 * 60 * 1000;
          ageCalculationMethod = "fallback";
          isValidActivity = false;
        }
      } else if (chat.chat_type === "group") {
        // For group chats, consider both messages and group updates
        const messageTime = timestamps.latestMessage;
        const updateTime = timestamps.updatedAt;

        // Use the most recent between message and update (group settings, members, etc.)
        if (messageTime && updateTime) {
          if (messageTime > updateTime) {
            lastActivityTime = messageTime;
            ageCalculationMethod = "latest_message";
          } else {
            lastActivityTime = updateTime;
            ageCalculationMethod = "updated_at";
          }
          isValidActivity = true;
        } else if (messageTime) {
          lastActivityTime = messageTime;
          ageCalculationMethod = "latest_message";
          isValidActivity = true;
        } else if (updateTime) {
          lastActivityTime = updateTime;
          ageCalculationMethod = "updated_at";
          isValidActivity = true;
        } else if (timestamps.createdAt) {
          lastActivityTime = timestamps.createdAt;
          ageCalculationMethod = "created_at";
          isValidActivity = false;
        } else {
          lastActivityTime = currentTime - 60 * 60 * 1000;
          ageCalculationMethod = "fallback";
          isValidActivity = false;
        }
      } else if (chat.chat_type === "business") {
        // For business chats, prioritize customer interactions
        if (timestamps.latestMessage && timestamps.latestMessage > 0) {
          lastActivityTime = timestamps.latestMessage;
          ageCalculationMethod = "latest_message";
          isValidActivity = true;
        } else if (timestamps.updatedAt && timestamps.updatedAt > 0) {
          lastActivityTime = timestamps.updatedAt;
          ageCalculationMethod = "updated_at";
          isValidActivity = true;
        } else if (timestamps.createdAt && timestamps.createdAt > 0) {
          lastActivityTime = timestamps.createdAt;
          ageCalculationMethod = "created_at";
          isValidActivity = false;
        } else {
          lastActivityTime = currentTime - 60 * 60 * 1000;
          ageCalculationMethod = "fallback";
          isValidActivity = false;
        }
      } else {
        // Default fallback for any other chat types
        if (timestamps.latestMessage && timestamps.latestMessage > 0) {
          lastActivityTime = timestamps.latestMessage;
          ageCalculationMethod = "latest_message";
          isValidActivity = true;
        } else if (timestamps.updatedAt && timestamps.updatedAt > 0) {
          lastActivityTime = timestamps.updatedAt;
          ageCalculationMethod = "updated_at";
          isValidActivity = true;
        } else if (timestamps.createdAt && timestamps.createdAt > 0) {
          lastActivityTime = timestamps.createdAt;
          ageCalculationMethod = "created_at";
          isValidActivity = false;
        } else {
          lastActivityTime = currentTime - 60 * 60 * 1000;
          ageCalculationMethod = "fallback";
          isValidActivity = false;
        }
      }

      // Validate timestamp is reasonable (not in future, not too old)
      const maxReasonableAge = 365 * 24 * 60 * 60 * 1000; // 1 year
      if (lastActivityTime > currentTime) {
        // Future timestamp, use current time
        lastActivityTime = currentTime;
        ageCalculationMethod = "corrected_future";
        isValidActivity = false;
      } else if (currentTime - lastActivityTime > maxReasonableAge) {
        // Timestamp too old (>1 year), might be corrupted
        lastActivityTime = currentTime - maxReasonableAge;
        ageCalculationMethod = "corrected_old";
        isValidActivity = false;
      }

      const ageMs = currentTime - lastActivityTime;
      const ageInHours = ageMs / (1000 * 60 * 60);

      // Only include in average calculation if it's a valid activity timestamp
      if (isValidActivity && ageMs >= 0) {
        totalAgeMs += ageMs;
        if (ageMs > maxAgeMs) {
          maxAgeMs = ageMs;
        }
      }

      // Add to open chat details with enhanced information
      openChatDetails.push({
        chatId: chat.chat_id,
        chatName: chat.chat_name,
        ageInHours: Math.round(ageInHours * 100) / 100,
        chatType: chat.chat_type,
        agentPhone: chat.assigned_to,
        lastActivity: new Date(lastActivityTime).toISOString(),
        ageCalculationMethod,
        isValidActivity,
        memberCount: chat.member_count || 0,
        isAssigned: !!chat.assigned_to,
        orgPhone: chat.org_phone || null
      });

      // Enhanced delayed response detection
      if (chat.latest_message && chat.latest_message.timestamp) {
        const lastMessageTime = new Date(
          chat.latest_message.timestamp
        ).getTime();
        const timeSinceLastMessage = currentTime - lastMessageTime;

        // Chat type-specific delayed response logic
        let shouldConsiderDelayed = false;
        let responseThreshold = twentyFourHoursMs; // Default threshold

        if (chat.chat_type === "user") {
          // For user chats, only consider delayed if customer sent the last message
          shouldConsiderDelayed = !chat.latest_message.from_me;
        } else if (chat.chat_type === "group") {
          // For group chats, consider delayed if any member (not agent) sent the last message
          shouldConsiderDelayed = !chat.latest_message.from_me;
        } else if (chat.chat_type === "business") {
          // For business chats, stricter criteria - customer messages need faster response
          responseThreshold = 12 * 60 * 60 * 1000; // 12 hours for business
          shouldConsiderDelayed = !chat.latest_message.from_me;
        }

        if (shouldConsiderDelayed && timeSinceLastMessage >= responseThreshold) {
          chatsWithDelayedResponse++;
          delayedResponseDetails.push({
            chatId: chat.chat_id,
            chatName: chat.chat_name,
            chatType: chat.chat_type,
            lastMessageTime: chat.latest_message.timestamp,
            hoursWithoutResponse:
              Math.round((timeSinceLastMessage / (1000 * 60 * 60)) * 100) / 100,
            agentPhone: chat.assigned_to,
            lastMessageFromCustomer: !chat.latest_message.from_me,
            memberCount: chat.member_count || 0,
            orgPhone: chat.org_phone || null
          });
        }
      } else {
        // No latest message - consider as needing attention based on chat type
        let noMessageThreshold = twentyFourHoursMs;

        if (chat.chat_type === "business") {
          noMessageThreshold = 12 * 60 * 60 * 1000; // 12 hours for business
        } else if (chat.chat_type === "group") {
          noMessageThreshold = 48 * 60 * 60 * 1000; // 48 hours for groups (more flexible)
        }

        if (ageMs >= noMessageThreshold) {
          chatsWithDelayedResponse++;
          delayedResponseDetails.push({
            chatId: chat.chat_id,
            chatName: chat.chat_name,
            chatType: chat.chat_type,
            lastMessageTime: chat.updated_at || chat.created_at,
            hoursWithoutResponse:
              Math.round((ageMs / (1000 * 60 * 60)) * 100) / 100,
            agentPhone: chat.assigned_to,
            lastMessageFromCustomer: false,
            memberCount: chat.member_count || 0,
            reason: "no_messages",
            orgPhone: chat.org_phone || null
          });
        }
      }
    });

    // Calculate robust averages using only valid activity timestamps
    const validAgeCount = openChatDetails.filter(
      (chat) => chat.isValidActivity
    ).length;
    const averageAgeInHours =
      validAgeCount > 0
        ? Math.round((totalAgeMs / validAgeCount / (1000 * 60 * 60)) * 100) /
          100
        : 0;

    const maxAgeInHours = Math.round((maxAgeMs / (1000 * 60 * 60)) * 100) / 100;

    const metrics: ChatMetrics = {
      totalOpenChats,
      averageAgeInHours,
      maxAgeInHours,
      chatsWithDelayedResponse,
      openChatDetails: openChatDetails.sort(
        (a, b) => b.ageInHours - a.ageInHours
      ),
      delayedResponseDetails: delayedResponseDetails.sort(
        (a, b) => b.hoursWithoutResponse - a.hoursWithoutResponse
      ),
      _debug: {
        periskopePhone: process.env.NEXT_PUBLIC_PERISKOPE_PHONE,
        hasApiKey: !!process.env.NEXT_PUBLIC_PERISKOPE_API_KEY,
        totalChatsFound: chats.length,
        validActivityChats: validAgeCount,
        chatTypeFilter: filterType,
        agentPhonesChecked: agent ? [agent] : ['all'],
        chatTypeDistribution: {
          user: chats.filter((c) => c.chat_type === "user").length,
          group: chats.filter((c) => c.chat_type === "group").length,
          business: chats.filter((c) => c.chat_type === "business").length,
        },
        delayedResponseThresholds: {
          user: "24 hours",
          group: "24 hours",
          business: "12 hours",
          noMessages: {
            user: "24 hours",
            group: "48 hours",
            business: "12 hours",
          },
        },
        timeFilter: timeFilter,
        filterApplied: getFilterDescription(chatType, agent, orgPhone, filterOpen, timeFilter),
      },
    };

    console.log("[chat-analytics] robust chat metrics calculated:", {
      totalOpenChats: totalOpenChats,
      validActivityChats: validAgeCount,
      chatTypeDistribution: {
        user: chats.filter((c) => c.chat_type === "user").length,
        group: chats.filter((c) => c.chat_type === "group").length,
        business: chats.filter((c) => c.chat_type === "business").length,
      },
      averageAgeInHours,
      maxAgeInHours,
      chatsWithDelayedResponse,
      timeFilter,
    });

    return NextResponse.json({ metrics });
  }
  
  // Helper function to create a human-readable description of the filters applied
  function getFilterDescription(chatType?: string, agent?: string, orgPhone?: string, filterOpen?: boolean, timeFilter?: string): string {
    const filters: string[] = [];
    
    if (filterOpen) {
      filters.push("open chats only");
    }
    
    if (timeFilter && timeFilter !== "all") {
      const timeLabels: Record<string, string> = {
        day: "last 24 hours",
        week: "last 7 days",
        month: "last 30 days",
      };
      
      filters.push(timeLabels[timeFilter] || timeFilter);
    }
    
    if (chatType) {
      filters.push(`chat type: ${chatType}`);
    }
    
    if (agent) {
      filters.push(`agent: ${agent.substring(0, 5)}...`);
    }
    
    if (orgPhone) {
      filters.push(`org phone: ${orgPhone.substring(0, 5)}...`);
    }
    
    return filters.length > 0 ? filters.join(", ") : "none - showing all chats";
  }
}