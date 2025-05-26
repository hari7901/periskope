// app/api/custom-property-values/route.ts

import { NextRequest, NextResponse } from "next/server";
import { periskopeClient } from "@/app/lib/periskope";
import type { Chat } from "@/app/lib/types/periskope";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const propertyId = params.get("propertyId");

  if (!propertyId) {
    return NextResponse.json(
      { error: "Property ID is required" },
      { status: 400 }
    );
  }

  try {
    console.log("[custom-property-values] fetching values for", propertyId);

    // First, fetch a sample of chats to extract unique values
    // Use a safer approach to extract chats from the response
    let chats: Chat[] = [];
    try {
      const response = await periskopeClient.chat.getChats({
        limit: 1000, // Adjust based on your needs
      });

      // Try to safely extract chats from the response with proper type handling
      if (response && typeof response === "object") {
        // Check data property first
        if (response.data && typeof response.data === "object") {
          if (Array.isArray(response.data.chats)) {
            chats = response.data.chats;
          }
        }
        // Fallback to direct response property
        else if (Array.isArray((response as any).chats)) {
          chats = (response as any).chats;
        }
      }
    } catch (err) {
      console.error("Error parsing chat response:", err);
      // Continue with empty chats array
    }

    // Try both with and without the "property-" prefix
    const alternativePropertyId = propertyId.replace("property-", "");

    // Extract unique values for the specified property
    const uniqueValues = new Set<string>();
    let propertiesFound = 0;

    chats.forEach((chat, index) => {
      if (chat.custom_properties) {
        // Try with original property ID
        if (
          chat.custom_properties[propertyId] !== undefined &&
          chat.custom_properties[propertyId] !== null
        ) {
          uniqueValues.add(String(chat.custom_properties[propertyId]));
          propertiesFound++;
        }
        // Try with alternative property ID
        else if (
          chat.custom_properties[alternativePropertyId] !== undefined &&
          chat.custom_properties[alternativePropertyId] !== null
        ) {
          uniqueValues.add(
            String(chat.custom_properties[alternativePropertyId])
          );
          propertiesFound++;
        }

        // Log some samples to debug
        if (index < 3) {
          console.log(
            `[custom-property-values] chat ${index} custom_properties:`,
            JSON.stringify(chat.custom_properties).substring(0, 200) + "..."
          );
        }
      }
    });

    console.log(
      `[custom-property-values] found ${propertiesFound} properties and ${uniqueValues.size} unique values`
    );

    // Convert to array and sort
    const values = Array.from(uniqueValues).sort();

    // If no values found, provide fallback mock values
    if (values.length === 0) {
      console.log(
        "[custom-property-values] No values found. Adding fallback mock values."
      );
      const mockValues = [
        "Customer Service",
        "Sales",
        "Technical Support",
        "Billing",
        "General Inquiry",
      ];

      return NextResponse.json({
        values: mockValues,
        _debug: {
          propertyId,
          alternativePropertyId,
          totalChats: chats.length,
          uniqueValueCount: 0,
          isMockData: true,
          error: "No values found for this property",
        },
      });
    }

    return NextResponse.json({
      values,
      _debug: {
        propertyId,
        alternativePropertyId,
        totalChats: chats.length,
        propertiesFound,
        uniqueValueCount: values.length,
      },
    });
  } catch (error: any) {
    console.error("[custom-property-values] error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch custom property values",
        details: error.message,
        values: ["Error", "Fallback", "Values"], // Provide fallback values even on error
      },
      { status: 500 }
    );
  }
}
