"use client";

import React from "react";
import { User, Users, Bot } from "lucide-react";

interface AgentFilterProps {
  onAgentChange: (agent: string) => void;
  selectedAgent: string;
}

const AgentFilter: React.FC<AgentFilterProps> = ({
  onAgentChange,
  selectedAgent,
}) => {
  // Your 4 agent numbers
  const agents = [
    { id: "", label: "All Agents", phone: "" },
    { id: "+911852701495", label: "Agent 1", phone: "+91 85270 14950" },
    { id: "+911852703388", label: "Agent 2", phone: "+91 85270 33886" },
    { id: "+911730346174", label: "Agent 3", phone: "+91 73034 61744" },
    { id: "+911852743922", label: "Agent 4", phone: "+91 85274 39222" },
  ];

  return (
    <div className="mb-4">
      <h3 className="text-lg font-medium mb-3 text-gray-800 dark:text-gray-200 flex items-center gap-2">
        <User className="h-5 w-5" />
        Filter by Agent
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        {agents.map((agent) => (
          <button
            key={agent.id}
            onClick={() => onAgentChange(agent.id)}
            className={`px-4 py-3 rounded-lg transition-colors text-sm font-medium text-left ${
              selectedAgent === agent.id
                ? "bg-blue-500 text-white dark:bg-blue-600"
                : "bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              {agent.id === "" ? (
                <Users className="h-4 w-4" />
              ) : (
                <Bot className="h-4 w-4" />
              )}
              <span className="font-semibold">{agent.label}</span>
            </div>
            {agent.phone && (
              <div className="text-xs opacity-75 font-mono">
                {agent.phone}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default AgentFilter;