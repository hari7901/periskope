// app/components/date-range-picker.tsx
"use client";

import React from "react";

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  isVisible: boolean;
}

const DateRangePicker: React.FC<DateRangePickerProps> = ({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  isVisible,
}) => {
  if (!isVisible) return null;

  return (
    <div className="flex flex-col sm:flex-row gap-4 mt-6 mb-2 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
      <div className="flex flex-col">
        <label
          htmlFor="start-date"
          className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Start Date
        </label>
        <input
          id="start-date"
          type="date"
          value={startDate}
          onChange={(e) => onStartDateChange(e.target.value)}
          className="border border-gray-300 dark:border-gray-600 rounded-md p-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
        />
      </div>
      <div className="flex flex-col">
        <label
          htmlFor="end-date"
          className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          End Date
        </label>
        <input
          id="end-date"
          type="date"
          value={endDate}
          onChange={(e) => onEndDateChange(e.target.value)}
          className="border border-gray-300 dark:border-gray-600 rounded-md p-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
        />
      </div>
      <div className="flex items-end mt-4 sm:mt-0">
        <button
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md text-sm font-medium transition-colors"
          onClick={() => {
            const today = new Date();
            const startDateObj = new Date(startDate);
            const endDateObj = new Date(endDate);

            if (startDateObj > endDateObj) {
              // If start date is after end date, swap them
              onStartDateChange(endDate);
              onEndDateChange(startDate);
            } else if (endDateObj > today) {
              // If end date is in the future, set it to today
              onEndDateChange(today.toISOString().split("T")[0]);
            }
          }}
        >
          Apply Range
        </button>
      </div>
    </div>
  );
};

export default DateRangePicker;
