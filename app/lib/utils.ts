// app/lib/utils.ts

// Get date range for different time periods
export function getDateRange(period: string): {
  startDate: Date;
  endDate: Date;
} {
  const now = new Date();
  let endDate = new Date(now);
  let startDate = new Date(now);

  switch (period) {
    case "today":
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      break;
    case "yesterday":
      startDate.setDate(now.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
      endDate.setDate(now.getDate() - 1);
      endDate.setHours(23, 59, 59, 999);
      break;
    case "last7days":
      startDate.setDate(now.getDate() - 6); // Last 7 days including today
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      break;
    case "lastMonth":
      startDate.setDate(now.getDate() - 29); // Last 30 days including today
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      break;
    case "last3months":
      startDate.setDate(now.getDate() - 89); // Last 90 days including today
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      break;
    case "thisMonth":
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "lastCalendarMonth":
      startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      break;
    default:
      // Default to last 7 days
      startDate.setDate(now.getDate() - 6);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
  }

  return { startDate, endDate };
}

// Format date for API requests
export function formatDateForAPI(date: Date): string {
  return date.toISOString();
}

// Get color intensity based on message count for heatmap
export function getColorIntensity(value: number, maxValue: number): string {
  if (maxValue === 0) return "rgb(240, 240, 240)"; // Light gray for no data

  const intensity = Math.min(value / maxValue, 1);

  // Blue gradient that works in light/dark mode
  if (intensity === 0) return "transparent";

  // Use a blue palette
  const r = Math.round(33 + intensity * 0); // Stays low
  const g = Math.round(150 + intensity * 50); // Increase with intensity
  const b = Math.round(240 - intensity * 40); // Decrease with intensity
  const a = 0.1 + intensity * 0.9; // Increase opacity with intensity

  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// Group messages by day of week and hour
export function groupMessagesByDayAndHour(messages: any[]) {
  const dayHourMap: Record<string, Record<string, number>> = {};
  const days = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  // Initialize the map
  days.forEach((day) => {
    dayHourMap[day] = {};
    for (let hour = 0; hour < 24; hour++) {
      dayHourMap[day][`${hour}`] = 0;
    }
  });

  // Count messages
  messages.forEach((message) => {
    if (message.timestamp) {
      const date = new Date(message.timestamp);
      // Adjust day index (0 = Sunday in JS, but we want 0 = Monday)
      let dayIndex = date.getDay() - 1;
      if (dayIndex < 0) dayIndex = 6; // Sunday becomes 6

      const day = days[dayIndex];
      const hour = date.getHours().toString();

      if (dayHourMap[day] && dayHourMap[day][hour] !== undefined) {
        dayHourMap[day][hour]++;
      }
    }
  });

  return dayHourMap;
}

// Find the maximum message count in the heatmap data
export function findMaxValue(
  data: Record<string, Record<string, number>>
): number {
  let max = 0;
  Object.values(data).forEach((dayData) => {
    Object.values(dayData).forEach((count) => {
      if (count > max) max = count;
    });
  });
  return max;
}

// Get the day with the most messages
export function getMostActiveDay(
  data: Record<string, Record<string, number>>
): { day: string; count: number } {
  let maxDay = "";
  let maxCount = 0;

  Object.entries(data).forEach(([day, hours]) => {
    const dayTotal = Object.values(hours).reduce(
      (sum, count) => sum + count,
      0
    );
    if (dayTotal > maxCount) {
      maxCount = dayTotal;
      maxDay = day;
    }
  });

  return { day: maxDay, count: maxCount };
}

// Get the hour with the most messages
export function getPeakHour(data: Record<string, Record<string, number>>): {
  hour: string;
  count: number;
} {
  let maxHour = "";
  let maxCount = 0;

  // Collect counts for each hour across all days
  const hourTotals: Record<string, number> = {};

  for (let hour = 0; hour < 24; hour++) {
    const hourString = hour.toString();
    hourTotals[hourString] = 0;

    Object.values(data).forEach((dayData) => {
      if (dayData[hourString]) {
        hourTotals[hourString] += dayData[hourString];
      }
    });

    if (hourTotals[hourString] > maxCount) {
      maxCount = hourTotals[hourString];
      maxHour = hourString;
    }
  }

  return { hour: maxHour, count: maxCount };
}

// Format the hour range in a human-readable format (e.g., "2:00 PM - 3:00 PM")
export function formatHourRange(hour: string): string {
  const hourNum = parseInt(hour);
  const nextHour = (hourNum + 1) % 24;

  const startHour = formatHour(hourNum);
  const endHour = formatHour(nextHour);

  return `${startHour} - ${endHour}`;
}

// Format a single hour in 12-hour format with AM/PM
function formatHour(hour: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:00 ${period}`;
}

// Calculate average messages per day in the date range
export function calculateAveragePerDay(
  messages: any[],
  dateRange: { startDate: Date; endDate: Date }
): number {
  const startDate = new Date(dateRange.startDate);
  const endDate = new Date(dateRange.endDate);

  // Calculate days difference (including both start and end date)
  const daysDiff =
    Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;

  return Math.round(messages.length / daysDiff);
}

export function businessHoursDifference(start: Date, end: Date): number {
  let total = 0;
  const oneDay = 24 * 60 * 60 * 1000;

  // clone date at midnight
  let day = new Date(start);
  day.setHours(0, 0, 0, 0);

  while (day < end) {
    const isWeekday = day.getDay() >= 1 && day.getDay() <= 5;
    if (isWeekday) {
      const bhStart = new Date(day);
      bhStart.setHours(9, 0, 0, 0);
      const bhEnd = new Date(day);
      bhEnd.setHours(17, 0, 0, 0);

      const sliceStart = start > bhStart ? start : bhStart;
      const sliceEnd = end < bhEnd ? end : bhEnd;
      if (sliceEnd > sliceStart) {
        total += sliceEnd.getTime() - sliceStart.getTime();
      }
    }
    day = new Date(day.getTime() + oneDay);
  }
  return total;
}

/**
 * Given a mixed list of messages, pairs each customer→next agent reply,
 * returns average absolute and business‑hours delay in ms.
 */
export function computeAverageReplyDelay(messages: any[]): {
  avgAbsoluteMs: number;
  avgBusinessMs: number;
} {
  // sort by timestamp ascending
  const sorted = [...messages].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const deltasAbs: number[] = [];
  const deltasBiz: number[] = [];

  let lastCustomer: any | null = null;
  for (const msg of sorted) {
    if (!msg.from_me) {
      // customer
      lastCustomer = msg;
    } else if (msg.from_me && lastCustomer) {
      // agent reply
      const custTime = new Date(lastCustomer.timestamp);
      const agentTime = new Date(msg.timestamp);
      if (agentTime > custTime) {
        const absDelta = agentTime.getTime() - custTime.getTime();
        deltasAbs.push(absDelta);
        deltasBiz.push(businessHoursDifference(custTime, agentTime));
      }
      lastCustomer = null;
    }
  }

  const avg = (arr: number[]) =>
    arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;

  return {
    avgAbsoluteMs: avg(deltasAbs),
    avgBusinessMs: avg(deltasBiz),
  };
}