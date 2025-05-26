// app/api/custom-property-distribution/route.ts

import { NextRequest, NextResponse } from "next/server";
import { periskopeClient } from "@/app/lib/periskope";
import type { Chat } from "@/app/lib/types/periskope";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const propertyId = params.get("propertyId");
  const chatType = params.get("chatType");

  if (!propertyId) {
    return NextResponse.json(
      { error: "Property ID is required" },
      { status: 400 }
    );
  }

  try {
    console.log("[custom-property-distribution] fetching data for", {
      propertyId,
      chatType,
    });

    // Fetch chats with optional chat type filter
    const options: any = {
      limit: 1000,
    };

    if (chatType) {
      options.chat_type = chatType;
    }

    // Get chats from Periskope
    const response = await periskopeClient.chat.getChats(options);

    // Extract chats from the response safely
    let chats: Chat[] = [];

    if (response) {
      // Try to extract chats from data property
      if (
        response.data &&
        response.data.chats &&
        Array.isArray(response.data.chats)
      ) {
        chats = response.data.chats;
      }
      // Try direct chats property
      else if (
        (response as any).chats &&
        Array.isArray((response as any).chats)
      ) {
        chats = (response as any).chats;
      }
      // If response itself is array of chats
      else if (
        Array.isArray(response) &&
        response.length > 0 &&
        response[0].chat_id
      ) {
        chats = response;
      }
    }

    console.log(`[custom-property-distribution] found ${chats.length} chats`);

    // Sample the first few chats to examine their structure
    if (chats.length > 0) {
      const sampleChat = chats[0];
      console.log("[custom-property-distribution] sample chat structure:", {
        chat_id: sampleChat.chat_id,
        chat_type: sampleChat.chat_type,
        has_custom_properties: !!sampleChat.custom_properties,
        custom_properties_type: typeof sampleChat.custom_properties,
        custom_properties_keys: sampleChat.custom_properties
          ? Object.keys(sampleChat.custom_properties)
          : [],
        has_our_property: sampleChat.custom_properties
          ? propertyId in sampleChat.custom_properties
          : false,
      });
    }

    // Count values - check for both property-mhpfkllsoayiisiq and without the prefix
    const valueCounts: Record<string, number> = {};
    const alternativePropertyId = propertyId.replace("property-", "");

    let propertiesFound = 0;
    let chatsWithProperty = 0;

    chats.forEach((chat, index) => {
      let hasProperty = false;
      let value = null;

      if (
        chat.custom_properties &&
        typeof chat.custom_properties === "object"
      ) {
        // Try with the original property ID
        if (chat.custom_properties[propertyId] !== undefined) {
          value = chat.custom_properties[propertyId];
          propertiesFound++;
          hasProperty = true;
        }
        // Try with the alternative property ID (without prefix)
        else if (chat.custom_properties[alternativePropertyId] !== undefined) {
          value = chat.custom_properties[alternativePropertyId];
          propertiesFound++;
          hasProperty = true;
          console.log(
            `[custom-property-distribution] found property with alternative ID: ${alternativePropertyId}`
          );
        }
        // Look for any property containing the ID as a substring
        else {
          const keys = Object.keys(chat.custom_properties);
          for (const key of keys) {
            if (key.includes(alternativePropertyId)) {
              value = chat.custom_properties[key];
              propertiesFound++;
              hasProperty = true;
              console.log(
                `[custom-property-distribution] found property with similar key: ${key}`
              );
              break;
            }
          }
        }

        if (hasProperty) {
          chatsWithProperty++;
          const stringValue = String(value || "undefined");
          valueCounts[stringValue] = (valueCounts[stringValue] || 0) + 1;
        }

        // Log a few sample custom_properties objects to inspect
        if (index < 5) {
          console.log(
            `[custom-property-distribution] chat ${index} custom_properties:`,
            JSON.stringify(chat.custom_properties).substring(0, 200) + "..."
          );
        }
      }
    });

    console.log(`[custom-property-distribution] property stats:`, {
      totalChats: chats.length,
      chatsWithProperty,
      propertiesFound,
      uniqueValues: Object.keys(valueCounts).length,
    });

    // Convert to array format for chart
    const distribution = Object.entries(valueCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value); // Sort by count descending

    // If no values found, provide a fallback with mock data for testing
    if (distribution.length === 0) {
      console.log(
        "[custom-property-distribution] No values found. Adding fallback mock data."
      );
      return NextResponse.json({
        distribution: [
          { name: "No Data - Mock Value 1", value: 45 },
          { name: "No Data - Mock Value 2", value: 30 },
          { name: "No Data - Mock Value 3", value: 15 },
        ],
        _debug: {
          propertyId,
          chatType,
          totalChats: chats.length,
          uniqueValueCount: 0,
          error: "No values found for this property",
          isMockData: true,
          requestPath: request.nextUrl.pathname,
          requestParams: Object.fromEntries(params.entries()),
        },
      });
    }

    return NextResponse.json({
      distribution,
      _debug: {
        propertyId,
        alternativePropertyId,
        chatType,
        totalChats: chats.length,
        chatsWithProperty,
        uniqueValueCount: Object.keys(valueCounts).length,
        requestPath: request.nextUrl.pathname,
        requestParams: Object.fromEntries(params.entries()),
      },
    });
  } catch (error: any) {
    console.error("[custom-property-distribution] error:", error);

    // Return detailed error info for debugging
    return NextResponse.json(
      {
        error: "Failed to fetch custom property distribution",
        details: error.message,
        stack: error.stack,
        _debug: {
          propertyId,
          chatType,
          requestPath: request.nextUrl.pathname,
          requestParams: Object.fromEntries(params.entries()),
        },
      },
      { status: 500 }
    );
  }
}
