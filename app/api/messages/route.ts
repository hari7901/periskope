// app/api/messages/route.ts
import { NextRequest, NextResponse } from "next/server";
import { periskopeClient } from "@/app/lib/periskope";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const startTimeISO = params.get("startTime")!;
  const endTimeISO = params.get("endTime")!;
  const limit = parseInt(params.get("limit") || "10000", 10); // Increased default limit
  const orgPhone = params.get("orgPhone") ?? undefined;
  const customPropertyId = params.get("customPropertyId") ?? undefined;
  const customPropertyValue = params.get("customPropertyValue") ?? undefined;

  console.log("[messages-api] fetching messages", {
    start: startTimeISO,
    end: endTimeISO,
    limit,
    orgPhone,
    customPropertyId,
    customPropertyValue,
  });

  const baseOptions: any = {
    limit: 1000, // Use 1000 per page for pagination
    ...(orgPhone && { org_phone: orgPhone }),
  };

  // Add custom property filters if provided
  if (customPropertyId && customPropertyValue) {
    baseOptions.custom_property_id = customPropertyId;
    baseOptions.custom_property_value = customPropertyValue;
  }

  // Fetch messages with pagination and proper error handling
  async function loadAllMessagesInTimeRange(
    sISO: string,
    eISO: string
  ): Promise<any[]> {
    let allMessages: any[] = [];
    let offset = 0;
    let hasMore = true;
    let pageCount = 0;
    const maxPages = 50; // Safety limit to prevent infinite loops

    while (hasMore && pageCount < maxPages) {
      pageCount++;
      console.log(`[messages-api] fetching page ${pageCount} (offset: ${offset})`);

      let response: any;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          response = await periskopeClient.chat.getMessages({
            ...baseOptions,
            start_time: sISO,
            end_time: eISO,
            offset: offset,
          });

          if ((response as any).error) {
            throw new Error((response as any).error);
          }
          break; // Success
        } catch (err: any) {
          console.error(`[messages-api] attempt ${attempt} failed:`, err);
          
          if (err.statusCode === 429 && attempt < 3) {
            const backoff = 1000 * 2 ** (attempt - 1);
            console.warn(`[messages-api] 429 rate limit, retrying in ${backoff}ms`);
            await new Promise((r) => setTimeout(r, backoff));
            continue;
          }
          
          if (attempt === 3) {
            throw err; // Final attempt failed
          }
        }
      }

      // Extract messages from response
      const container = response.data ?? response;
      const pageMessages = Array.isArray(container.messages)
        ? container.messages
        : Array.isArray(response.messages)
        ? response.messages
        : Array.isArray(response)
        ? response
        : [];

      console.log(`[messages-api] page ${pageCount} returned ${pageMessages.length} messages`);
      
      allMessages.push(...pageMessages);

      // Check if we should continue pagination
      if (pageMessages.length < baseOptions.limit) {
        hasMore = false;
        console.log(`[messages-api] reached end of messages (${pageMessages.length} < ${baseOptions.limit})`);
      } else {
        offset += baseOptions.limit;
      }

      // Check for cursor-based pagination if available
      const nextCursor = (container.next_cursor as string) ??
        (response.next_cursor as string) ??
        undefined;
      
      if (nextCursor) {
        baseOptions.cursor = nextCursor;
        delete baseOptions.offset; // Use cursor instead of offset
      } else if (!hasMore) {
        break;
      }
    }

    console.log(`[messages-api] total messages collected: ${allMessages.length} from ${pageCount} pages`);
    return allMessages;
  }

  try {
    const startDate = new Date(startTimeISO);
    const endDate = new Date(endTimeISO);
    const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

    console.log(`[messages-api] fetching messages for ${totalDays} days from ${startTimeISO} to ${endTimeISO}`);

    // For smaller time ranges (7 days or less), fetch all at once
    if (totalDays <= 7) {
      const messages = await loadAllMessagesInTimeRange(startTimeISO, endTimeISO);
      console.log(`[messages-api] single range fetch complete: ${messages.length} messages`);
      return NextResponse.json({ messages });
    }

    // For larger time ranges, break into weekly chunks to avoid timeouts
    const intervals: { sISO: string; eISO: string }[] = [];
    const chunkDays = 7; // 7-day chunks

    for (
      let current = new Date(startDate);
      current < endDate;
      current.setDate(current.getDate() + chunkDays)
    ) {
      const chunkStart = new Date(current);
      const chunkEnd = new Date(current);
      chunkEnd.setDate(chunkEnd.getDate() + chunkDays);
      
      if (chunkEnd > endDate) {
        chunkEnd.setTime(endDate.getTime());
      }

      intervals.push({
        sISO: chunkStart.toISOString(),
        eISO: chunkEnd.toISOString(),
      });
    }

    console.log(`[messages-api] processing ${intervals.length} chunks of ${chunkDays} days each`);

    // Process chunks sequentially to avoid overwhelming the API
    const allResults: any[] = [];
    for (let i = 0; i < intervals.length; i++) {
      const { sISO, eISO } = intervals[i];
      console.log(`[messages-api] processing chunk ${i + 1}/${intervals.length}: ${sISO} → ${eISO}`);
      
      try {
        const chunkMessages = await loadAllMessagesInTimeRange(sISO, eISO);
        console.log(`[messages-api] chunk ${i + 1} returned ${chunkMessages.length} messages`);
        allResults.push(...chunkMessages);
        
        // Small delay between chunks to be respectful to the API
        if (i < intervals.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (err) {
        console.error(`[messages-api] chunk ${i + 1} failed:`, err);
        // Continue with other chunks even if one fails
      }
    }

    console.log(`[messages-api] all chunks complete: ${allResults.length} total messages`);
    return NextResponse.json({ messages: allResults });

  } catch (error: any) {
    console.error("[messages-api] error fetching messages:", error);
    return NextResponse.json(
      { 
        error: "Failed to fetch messages", 
        details: error.message,
        stack: error.stack
      },
      { status: 500 }
    );
  }
}