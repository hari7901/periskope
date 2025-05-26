// app/api/messages/route.ts
import { NextRequest, NextResponse } from "next/server";
import { periskopeClient } from "@/app/lib/periskope";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const startTimeISO = params.get("startTime")!;
  const endTimeISO = params.get("endTime")!;
  const limit = parseInt(params.get("limit") || "2000", 10);
  const orgPhone = params.get("orgPhone") ?? undefined;

  console.log("[route] fetching messages", {
    start: startTimeISO,
    end: endTimeISO,
    limit,
    orgPhone,
  });

  const baseOptions: any = {
    limit,
    ...(orgPhone && { org_phone: orgPhone }),
  };

  // Fetch + paginate one window, with 429 backoff
  async function loadAllMessagesWindow(
    sISO: string,
    eISO: string
  ): Promise<any[]> {
    let allPages: any[] = [];
    let cursor: string | undefined;

    do {
      let resp: any;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          resp = await periskopeClient.chat.getMessages({
            ...baseOptions,
            start_time: sISO,
            end_time: eISO,
            ...(cursor && { cursor }),
          });
          if ((resp as any).error) throw resp.error;
          break; // success
        } catch (err: any) {
          if (err.statusCode === 429 && attempt < 3) {
            const backoff = 1000 * 2 ** (attempt - 1);
            console.warn(
              `[route] 429 received, retrying chunk in ${backoff}ms`
            );
            await new Promise((r) => setTimeout(r, backoff));
            continue;
          }
          throw err;
        }
      }

      const container = resp.data ?? resp;
      const page = Array.isArray(container.messages)
        ? container.messages
        : Array.isArray(resp.messages)
        ? resp.messages
        : Array.isArray(resp)
        ? resp
        : [];

      allPages.push(...page);
      cursor =
        (container.next_cursor as string) ??
        (resp.next_cursor as string) ??
        undefined;
    } while (cursor);

    return allPages;
  }

  try {
    const startDate = new Date(startTimeISO);
    const endDate = new Date(endTimeISO);

    // Build daily intervals
    const intervals: { sISO: string; eISO: string }[] = [];
    for (
      let day = new Date(startDate);
      day < endDate;
      day.setDate(day.getDate() + 1)
    ) {
      const chunkStart = new Date(day);
      const chunkEnd = new Date(day);
      chunkEnd.setDate(chunkEnd.getDate() + 1);
      if (chunkEnd > endDate) chunkEnd.setTime(endDate.getTime());

      intervals.push({
        sISO: chunkStart.toISOString(),
        eISO: chunkEnd.toISOString(),
      });
    }

    console.log(
      `[route] processing ${intervals.length} chunks with concurrency=2`
    );

    // Concurrency‐limited pool (2 at a time)
    const results: any[] = [];
    let idx = 0;
    async function worker() {
      while (idx < intervals.length) {
        const { sISO, eISO } = intervals[idx++];
        console.log(`[route] worker fetching ${sISO} → ${eISO}`);
        try {
          const msgs = await loadAllMessagesWindow(sISO, eISO);
          console.log(`[route] chunk returned ${msgs.length}`);
          results.push(...msgs);
        } catch (err) {
          console.error(`[route] chunk error for ${sISO} → ${eISO}:`, err);
        }
      }
    }

    // launch two workers
    await Promise.all([worker(), worker()]);

    console.log("[route] total messages fetched:", results.length);
    return NextResponse.json({ messages: results });
  } catch (error: any) {
    console.error("[route] error fetching messages:", error);
    return NextResponse.json(
      { error: "Failed to fetch messages", details: error.message },
      { status: 500 }
    );
  }
}
