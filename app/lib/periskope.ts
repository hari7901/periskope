// app/lib/periskope.ts

import { PeriskopeApi } from "@periskope/periskope-client";
import type { Message, MessageData } from "./types/periskope";

// Get API key and phone from environment variables with fallbacks
const apiKey = process.env.NEXT_PUBLIC_PERISKOPE_API_KEY || "";
const phone = process.env.NEXT_PUBLIC_PERISKOPE_PHONE || "";

// Initialize the Periskope client with proper configuration
export const periskopeClient = new PeriskopeApi({
  authToken: apiKey,
  phone: phone,
});

// Log configuration (without exposing sensitive data)
console.log("[periskope-client] Initialized with:", {
  hasApiKey: !!apiKey,
  hasPhone: !!phone,
  phonePrefix: phone ? phone.substring(0, 3) + "..." : "not set",
});

export type { Message, MessageData };

// Function to parse messages into hourly data
export function parseMessagesIntoHourlyData(messages: Message[]) {
  const hourlyData: Record<string, Record<string, number>> = {
    Monday: {},
    Tuesday: {},
    Wednesday: {},
    Thursday: {},
    Friday: {},
    Saturday: {},
    Sunday: {},
  };

  // Initialize all hours to 0
  for (const day in hourlyData) {
    for (let hour = 0; hour < 24; hour++) {
      hourlyData[day][`${hour}:00`] = 0;
    }
  }

  // Count messages
  messages.forEach((message) => {
    const date = new Date(message.timestamp);
    const day = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ][date.getDay()];
    const hourKey = `${date.getHours()}:00`;
    if (hourlyData[day] && hourlyData[day][hourKey] !== undefined) {
      hourlyData[day][hourKey]++;
    }
  });

  return hourlyData;
}