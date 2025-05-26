// app/components/heatmap.tsx
"use client";

import React, { useEffect, useState } from "react";
import { getColorIntensity, findMaxValue } from "@/app/lib/utils";

interface HeatMapProps {
  data: Record<string, Record<string, number>>;
  title: string;
}

const HeatMap: React.FC<HeatMapProps> = ({ data, title }) => {
  const [maxValue, setMaxValue] = useState<number>(0);
  const days = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];
  const hours = Array.from({ length: 24 }, (_, i) => i);

  useEffect(() => {
    setMaxValue(findMaxValue(data));
  }, [data]);

  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        No data available for the selected period.
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-200">
          {title}
        </h3>

        <div className="flex items-center">
          <span className="text-xs text-gray-600 dark:text-gray-400 mr-2">
            Low
          </span>
          <div className="flex h-4 w-24">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-4 w-6"
                style={{
                  backgroundColor: getColorIntensity(
                    i * (maxValue / 4),
                    maxValue
                  ),
                }}
              />
            ))}
          </div>
          <span className="text-xs text-gray-600 dark:text-gray-400 ml-2">
            High
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-max">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="p-3 border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900">
                  Day / Hour
                </th>
                {hours.map((hour) => (
                  <th
                    key={hour}
                    className="p-2 border border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900"
                  >
                    {hour}:00
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr key={day}>
                  <td className="p-3 border border-gray-200 dark:border-gray-700 font-medium text-sm text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-900">
                    {day}
                  </td>
                  {hours.map((hour) => {
                    const count =
                      data[day] && data[day][hour.toString()] !== undefined
                        ? data[day][hour.toString()]
                        : 0;

                    return (
                      <td
                        key={`${day}-${hour}`}
                        className="p-2 border border-gray-200 dark:border-gray-700 text-center relative group"
                        style={{
                          backgroundColor: getColorIntensity(count, maxValue),
                          width: "2.5rem",
                          height: "2.5rem",
                        }}
                      >
                        {/* No count text */}
                        <div className="hidden group-hover:block absolute z-10 bg-gray-800 text-white dark:bg-gray-700 text-xs rounded py-1 px-2 -mt-8 ml-6 shadow-lg">
                          {day} {hour}:00 — {count} messages
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default HeatMap;
