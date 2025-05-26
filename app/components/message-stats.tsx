// app/components/message-stats.tsx
"use client";

import React, { useEffect, useState } from "react";
import {
  getMostActiveDay,
  getPeakHour,
  formatHourRange,
  calculateAveragePerDay,
  getDateRange,
} from "@/app/lib/utils";
import { Message } from "@/app/lib/periskope";

interface MessageStatsProps {
  totalMessages: number;
  periodLabel: string;
  isLoading: boolean;
  heatmapData?: Record<string, Record<string, number>>;
  messages: Message[];
  timeFilter: string;
}

const MessageStats: React.FC<MessageStatsProps> = ({
  totalMessages,
  periodLabel,
  isLoading,
  heatmapData = {},
  messages,
  timeFilter,
}) => {
  const [peakHourRange, setPeakHourRange] = useState<string>("");
  const [mostActiveDay, setMostActiveDay] = useState<string>("");
  const [averagePerDay, setAveragePerDay] = useState<number>(0);

  useEffect(() => {
    if (Object.keys(heatmapData).length > 0) {
      // Get peak hour
      const { hour } = getPeakHour(heatmapData);
      setPeakHourRange(formatHourRange(hour));

      // Get most active day
      const { day } = getMostActiveDay(heatmapData);
      setMostActiveDay(day);

      // Calculate average per day
      const dateRange = getDateRange(timeFilter);
      const avg = calculateAveragePerDay(messages, dateRange);
      setAveragePerDay(avg);
    }
  }, [heatmapData, messages, timeFilter]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700 animate-pulse">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-2"></div>
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700 animate-pulse">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-2"></div>
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700 animate-pulse">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-2"></div>
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-medium text-gray-500 dark:text-gray-400">
          Total Messages
        </h3>
        <p className="text-3xl font-bold text-gray-900 dark:text-white">
          {totalMessages.toLocaleString()}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {periodLabel}
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-medium text-gray-500 dark:text-gray-400">
          Avg. Messages/Day
        </h3>
        <p className="text-3xl font-bold text-gray-900 dark:text-white">
          {averagePerDay.toLocaleString()}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {periodLabel}
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-medium text-gray-500 dark:text-gray-400">
          Peak Activity
        </h3>
        <p className="text-3xl font-bold text-gray-900 dark:text-white">
          {peakHourRange}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Most messages on {mostActiveDay}
        </p>
      </div>
    </div>
  );
};

export default MessageStats;
