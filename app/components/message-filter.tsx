// app/components/message-filters.tsx
"use client";

import React from "react";

export interface Filters {
  orgPhone: string;
  primaryKam: string;
  plan: string;
  country: string;
  customKey: string;
  customValue: string;
}

interface MessageFiltersProps {
  filters: Filters;
  onChange: (newFilters: Filters) => void;
}

const MessageFilters: React.FC<MessageFiltersProps> = ({
  filters,
  onChange,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    onChange({ ...filters, [name]: value });
  };

  return (
    <div className="flex flex-wrap gap-4 mb-4">
      <input
        name="orgPhone"
        value={filters.orgPhone}
        onChange={handleChange}
        placeholder="Org Phone"
        className="border rounded p-2"
      />
      <input
        name="primaryKam"
        value={filters.primaryKam}
        onChange={handleChange}
        placeholder="Primary KAM"
        className="border rounded p-2"
      />
      <input
        name="plan"
        value={filters.plan}
        onChange={handleChange}
        placeholder="Plan"
        className="border rounded p-2"
      />
      <input
        name="country"
        value={filters.country}
        onChange={handleChange}
        placeholder="Country"
        className="border rounded p-2"
      />
      <input
        name="customKey"
        value={filters.customKey}
        onChange={handleChange}
        placeholder="Custom Key"
        className="border rounded p-2"
      />
      <input
        name="customValue"
        value={filters.customValue}
        onChange={handleChange}
        placeholder="Custom Value"
        className="border rounded p-2"
      />
    </div>
  );
};

export default MessageFilters;
