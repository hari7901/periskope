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
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const orgPhone = params.get("orgPhone") ?? undefined;
  const agent = params.get("agent") ?? undefined;
  const chatType = params.get("chatType") ?? "group"; // Default to group, but allow user/business
  const customPropertyId = params.get("customPropertyId") ?? undefined;
  const customPropertyValue = params.get("customPropertyValue") ?? undefined;

  console.log("[chat-analytics] fetching chat metrics", {
    orgPhone,
    agent,
    chatType,
    customPropertyId,
    customPropertyValue,
  });

  try {
    // Fetch chats of specified type that are open (chats without closed_at)
    const baseOptions: any = {
      limit: 2000,
      chat_type: chatType, // Use the chatType parameter
      ...(orgPhone && { org_phone: orgPhone }),
    };

    // Add custom property filter if provided
    if (customPropertyId && customPropertyValue) {
      baseOptions.custom_properties = {
        [customPropertyId]: customPropertyValue,
      };
    }

    const response = await periskopeClient.chat.getChats(baseOptions);
    const container = response.data ?? response;
    const allChats: Chat[] = Array.isArray(container.chats)
      ? container.chats
      : Array.isArray(response.chats)
      ? response.chats
      : [];

    // Filter for open chats of specified type (no closed_at timestamp)
    const openChatsOfType = allChats.filter(
      (chat) => !chat.closed_at && chat.chat_type === chatType
    );

    // If agent filter is specified, filter by assigned_to or latest message sender
    const filteredChats = agent
      ? openChatsOfType.filter(
          (chat) =>
            chat.assigned_to === agent ||
            chat.latest_message?.sender_phone === agent
        )
      : openChatsOfType;

    const now = new Date();
    const currentTime = now.getTime();
    const twentyFourHoursMs = 24 * 60 * 60 * 1000;

    // Calculate metrics for chats of specified type
    const totalOpenChats = filteredChats.length;
    let totalAgeMs = 0;
    let maxAgeMs = 0;
    let chatsWithDelayedResponse = 0;

    const openChatDetails: DetailedChatInfo[] = [];
    const delayedResponseDetails: any[] = [];

    filteredChats.forEach((chat) => {
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
      if (chatType === "user") {
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
      } else if (chatType === "group") {
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
      } else if (chatType === "business") {
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
        customProperty: customPropertyId
          ? chat.custom_properties?.[customPropertyId]
          : undefined,
      });

      // Enhanced delayed response detection
      if (chat.latest_message && chat.latest_message.timestamp) {
        const lastMessageTime = new Date(
          chat.latest_message.timestamp
        ).getTime();
        const timeSinceLastMessage = currentTime - lastMessageTime;

        // Chat type-specific delayed response logic
        let shouldConsiderDelayed = false;

        if (chatType === "user") {
          // For user chats, only consider delayed if customer sent the last message
          shouldConsiderDelayed =
            !chat.latest_message.from_me &&
            timeSinceLastMessage >= twentyFourHoursMs;
        } else if (chatType === "group") {
          // For group chats, consider delayed if any member (not agent) sent the last message
          shouldConsiderDelayed =
            !chat.latest_message.from_me &&
            timeSinceLastMessage >= twentyFourHoursMs;
        } else if (chatType === "business") {
          // For business chats, stricter criteria - customer messages need faster response
          const businessResponseTime = 12 * 60 * 60 * 1000; // 12 hours for business
          shouldConsiderDelayed =
            !chat.latest_message.from_me &&
            timeSinceLastMessage >= businessResponseTime;
        }

        if (shouldConsiderDelayed) {
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
            customProperty: customPropertyId
              ? chat.custom_properties?.[customPropertyId]
              : undefined,
          });
        }
      } else {
        // No latest message - consider as needing attention based on chat type
        let noMessageThreshold = twentyFourHoursMs;

        if (chatType === "business") {
          noMessageThreshold = 12 * 60 * 60 * 1000; // 12 hours for business
        } else if (chatType === "group") {
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
            customProperty: customPropertyId
              ? chat.custom_properties?.[customPropertyId]
              : undefined,
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
        totalChatsFound: allChats.length,
        openChatsOfTypeFound: openChatsOfType.length,
        validActivityChats: validAgeCount,
        chatTypeFilter: chatType,
        agentPhonesChecked: agent ? [agent] : ["all"],
        customPropertyFilter: customPropertyId
          ? `${customPropertyId}=${customPropertyValue}`
          : "none",
        chatTypeDistribution: {
          user: allChats.filter((c) => c.chat_type === "user").length,
          group: allChats.filter((c) => c.chat_type === "group").length,
          business: allChats.filter((c) => c.chat_type === "business").length,
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
        filterApplied: `${chatType}_only`,
      },
    };

    console.log("[chat-analytics] robust chat metrics calculated:", {
      totalOpenChats: totalOpenChats,
      validActivityChats: validAgeCount,
      chatType,
      averageAgeInHours,
      maxAgeInHours,
      chatsWithDelayedResponse,
      customPropertyFilter: customPropertyId
        ? `${customPropertyId}=${customPropertyValue}`
        : "none",
      delayedResponseLogic: {
        user: "24h from customer message",
        group: "24h from any member message",
        business: "12h from customer message",
      },
      filterApplied: `${chatType}_only`,
    });

    return NextResponse.json({ metrics });
  } catch (error: any) {
    console.error("[chat-analytics] error fetching chat metrics:", error);
    return NextResponse.json(
      { error: "Failed to fetch chat metrics", details: error.message },
      { status: 500 }
    );
  }
}
