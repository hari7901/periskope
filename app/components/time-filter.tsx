// app/components/time-filter.tsx
"use client";

import React from "react";

interface TimeFilterProps {
  onFilterChange: (filter: string) => void;
  selectedFilter: string;
}

const TimeFilter: React.FC<TimeFilterProps> = ({
  onFilterChange,
  selectedFilter,
}) => {
  const timeFilters = [
    { id: "today", label: "Today" },
    { id: "yesterday", label: "Yesterday" },
    { id: "last7days", label: "Last 7 Days" },
    { id: "last30days", label: "Last 30 Days" },
    { id: "thisMonth", label: "This Month" },
    { id: "lastMonth", label: "Last Month" },
    { id: "custom", label: "Custom" },
  ];

  return (
    <div className="mb-4">
      <h3 className="text-lg font-medium mb-3 text-gray-800 dark:text-gray-200">
        Time Period
      </h3>
      <div className="flex flex-wrap gap-2">
        {timeFilters.map((filter) => (
          <button
            key={filter.id}
            onClick={() => onFilterChange(filter.id)}
            className={`px-4 py-2 rounded-full transition-colors text-sm font-medium ${
              selectedFilter === filter.id
                ? "bg-blue-500 text-white dark:bg-blue-600"
                : "bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default TimeFilter;
