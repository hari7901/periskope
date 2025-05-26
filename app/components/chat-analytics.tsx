// app/components/chat-analytics.tsx
"use client";

import { useEffect, useState } from "react";
import {
  Clock,
  MessageCircle,
  AlertTriangle,
  TrendingUp,
  Users,
  ChevronDown,
  ChevronUp,
  Calendar,
  User,
  Bot,
} from "lucide-react";
import type { ChatMetrics } from "@/app/lib/types/periskope";

interface ChatAnalyticsProps {
  orgPhone: string;
  agent: string;
  chatType: string;
  customPropertyValue?: string; // Add this prop
}

export default function ChatAnalytics({
  orgPhone,
  agent,
  chatType,
  customPropertyValue = "", // Default to empty string
}: ChatAnalyticsProps) {
  const [metrics, setMetrics] = useState<ChatMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState({
    openChats: false,
    delayedChats: false,
  });

  const getChatTypeLabel = (type: string) => {
    switch (type) {
      case "user":
        return {
          single: "User Chat",
          plural: "User Chats",
          description: "Individual Conversations",
        };
      case "group":
        return {
          single: "Group Chat",
          plural: "Group Chats",
          description: "Group Conversations",
        };
      case "business":
        return {
          single: "Business Chat",
          plural: "Business Chats",
          description: "Business Conversations",
        };
      default:
        return {
          single: "Chat",
          plural: "Chats",
          description: "Conversations",
        };
    }
  };

  const chatTypeInfo = getChatTypeLabel(chatType);

  useEffect(() => {
    fetchChatMetrics();
  }, [orgPhone, agent, chatType, customPropertyValue]); // Add customPropertyValue to dependencies

  async function fetchChatMetrics() {
    setLoading(true);
    try {
      let url = `/api/chat-analytics`;
      const params = new URLSearchParams();

      if (orgPhone.trim()) {
        params.append("orgPhone", orgPhone.trim());
      }
      if (agent) {
        params.append("agent", agent);
      }
      if (chatType) {
        params.append("chatType", chatType);
      }
      if (customPropertyValue) {
        params.append("customPropertyId", "property-mhpfkllsoayiisiq");
        params.append("customPropertyValue", customPropertyValue);
      }

      if (params.toString()) {
        url += `?${params.toString()}`;
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error(`API ${res.status}`);

      const data = await res.json();
      setMetrics(data.metrics);
    } catch (error) {
      console.error("Error fetching chat metrics:", error);
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  }

  const toggleSection = (section: "openChats" | "delayedChats") => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const formatHours = (hours: number) => {
    if (hours < 1) {
      return `${Math.round(hours * 60)}m`;
    } else if (hours < 24) {
      return `${Math.round(hours * 10) / 10}h`;
    } else {
      const days = Math.floor(hours / 24);
      const remainingHours = Math.round(hours % 24);
      return `${days}d ${remainingHours}h`;
    }
  };

  const getUrgencyLevel = (hours: number) => {
    if (hours < 2) return { level: "low", color: "emerald", label: "Fresh" };
    if (hours < 8) return { level: "medium", color: "yellow", label: "Active" };
    if (hours < 24) return { level: "high", color: "orange", label: "Aging" };
    return { level: "critical", color: "red", label: "Critical" };
  };

  const getMetricCardClasses = (
    value: number,
    type: "age" | "count" | "delayed"
  ) => {
    if (type === "delayed") {
      return value > 0
        ? {
            card: "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20",
            icon: "text-red-600 dark:text-red-400",
            title: "text-red-700 dark:text-red-300",
            value: "text-red-900 dark:text-red-100",
            subtitle: "text-red-600 dark:text-red-400",
            overlay: "bg-red-100 dark:bg-red-800/30",
          }
        : {
            card: "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20",
            icon: "text-green-600 dark:text-green-400",
            title: "text-green-700 dark:text-green-300",
            value: "text-green-900 dark:text-green-100",
            subtitle: "text-green-600 dark:text-green-400",
            overlay: "bg-green-100 dark:bg-green-800/30",
          };
    }

    if (type === "age") {
      const urgency = getUrgencyLevel(value);
      switch (urgency.color) {
        case "emerald":
          return {
            card: "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20",
            icon: "text-emerald-600 dark:text-emerald-400",
            title: "text-emerald-700 dark:text-emerald-300",
            value: "text-emerald-900 dark:text-emerald-100",
            subtitle: "text-emerald-600 dark:text-emerald-400",
            overlay: "bg-emerald-100 dark:bg-emerald-800/30",
          };
        case "yellow":
          return {
            card: "border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20",
            icon: "text-yellow-600 dark:text-yellow-400",
            title: "text-yellow-700 dark:text-yellow-300",
            value: "text-yellow-900 dark:text-yellow-100",
            subtitle: "text-yellow-600 dark:text-yellow-400",
            overlay: "bg-yellow-100 dark:bg-yellow-800/30",
          };
        case "orange":
          return {
            card: "border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/20",
            icon: "text-orange-600 dark:text-orange-400",
            title: "text-orange-700 dark:text-orange-300",
            value: "text-orange-900 dark:text-orange-100",
            subtitle: "text-orange-600 dark:text-orange-400",
            overlay: "bg-orange-100 dark:bg-orange-800/30",
          };
        case "red":
        default:
          return {
            card: "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20",
            icon: "text-red-600 dark:text-red-400",
            title: "text-red-700 dark:text-red-300",
            value: "text-red-900 dark:text-red-100",
            subtitle: "text-red-600 dark:text-red-400",
            overlay: "bg-red-100 dark:bg-red-800/30",
          };
      }
    }

    // Default blue theme for count type
    return {
      card: "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20",
      icon: "text-blue-600 dark:text-blue-400",
      title: "text-blue-700 dark:text-blue-300",
      value: "text-blue-900 dark:text-blue-100",
      subtitle: "text-blue-600 dark:text-blue-400",
      overlay: "bg-blue-100 dark:bg-blue-800/30",
    };
  };

  const MetricCard = ({
    icon: Icon,
    title,
    value,
    subtitle,
    type,
  }: {
    icon: React.ComponentType<any>;
    title: string;
    value: string | number;
    subtitle: string;
    type: "age" | "count" | "delayed";
  }) => {
    const classes = getMetricCardClasses(
      typeof value === "number" ? value : 0,
      type
    );

    return (
      <div
        className={`relative overflow-hidden rounded-xl border-2 p-6 transition-all duration-200 hover:shadow-lg ${classes.card}`}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Icon className={`h-5 w-5 ${classes.icon}`} />
              <h3 className={`text-sm font-semibold ${classes.title}`}>
                {title}
              </h3>
            </div>
            <p className={`text-3xl font-bold ${classes.value}`}>{value}</p>
            <p className={`text-xs ${classes.subtitle} mt-1`}>{subtitle}</p>
          </div>
          <div
            className={`absolute -right-2 -top-2 h-16 w-16 rounded-full ${classes.overlay} opacity-50`}
          ></div>
        </div>
      </div>
    );
  };
  const getChatCardClasses = (urgency: { color: string }) => {
    switch (urgency.color) {
      case "emerald":
        return {
          border: "border-l-emerald-500",
          badge:
            "bg-emerald-100 text-emerald-800 dark:bg-emerald-800/30 dark:text-emerald-200",
          time: "text-emerald-600 dark:text-emerald-400",
          clock: "text-emerald-500",
        };
      case "yellow":
        return {
          border: "border-l-yellow-500",
          badge:
            "bg-yellow-100 text-yellow-800 dark:bg-yellow-800/30 dark:text-yellow-200",
          time: "text-yellow-600 dark:text-yellow-400",
          clock: "text-yellow-500",
        };
      case "orange":
        return {
          border: "border-l-orange-500",
          badge:
            "bg-orange-100 text-orange-800 dark:bg-orange-800/30 dark:text-orange-200",
          time: "text-orange-600 dark:text-orange-400",
          clock: "text-orange-500",
        };
      case "red":
      default:
        return {
          border: "border-l-red-500",
          badge: "bg-red-100 text-red-800 dark:bg-red-800/30 dark:text-red-200",
          time: "text-red-600 dark:text-red-400",
          clock: "text-red-500",
        };
    }
  };

  const ChatCard = ({
    chat,
    index,
    type,
  }: {
    chat: any;
    index: number;
    type: "open" | "delayed";
  }) => {
    const urgency = getUrgencyLevel(
      type === "delayed" ? chat.hoursWithoutResponse : chat.ageInHours
    );
    const hours =
      type === "delayed" ? chat.hoursWithoutResponse : chat.ageInHours;
    const classes = getChatCardClasses(urgency);

    return (
      <div
        key={`${type}-chat-${chat.chatId}-${index}`}
        className={`relative rounded-lg border-l-4 p-4 ${classes.border} bg-white dark:bg-gray-800`}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {chat.chatType === "group" ? (
                <Users className="h-4 w-4 text-blue-500" />
              ) : (
                <User className="h-4 w-4 text-green-500" />
              )}
              <h4 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                {chat.chatName}
              </h4>
              <span
                className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${classes.badge}`}
              >
                {urgency.label}
              </span>
            </div>

            <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
              <div className="flex items-center gap-1">
                <Bot className="h-3 w-3" />
                <span>{chat.agentPhone || "Unassigned"}</span>
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span className="capitalize">{chat.chatType}</span>
              </div>
            </div>

            {chat.lastActivity && (
              <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Last activity:{" "}
                {new Date(chat.lastActivity).toLocaleDateString()} at{" "}
                {new Date(chat.lastActivity).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            )}

            {type === "delayed" && (
              <div className="mt-2 text-xs text-red-600 dark:text-red-400">
                Customer waiting since:{" "}
                {new Date(chat.lastMessageTime).toLocaleDateString()} at{" "}
                {new Date(chat.lastMessageTime).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            )}
          </div>

          <div className="flex flex-col items-end">
            <span className={`text-lg font-bold ${classes.time}`}>
              {formatHours(hours)}
            </span>
            <Clock className={`h-4 w-4 ${classes.clock} mt-1`} />
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="space-y-8">
        {/* Loading skeleton for metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border p-6 animate-pulse"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="h-5 w-5 bg-gray-200 dark:bg-gray-700 rounded"></div>
                <div className="h-4 w-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
              </div>
              <div className="h-8 w-16 bg-gray-200 dark:bg-gray-700 rounded mb-2"></div>
              <div className="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded"></div>
            </div>
          ))}
        </div>

        {/* Loading skeleton for tables */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border overflow-hidden animate-pulse"
            >
              <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                <div className="h-6 w-48 bg-gray-200 dark:bg-gray-700 rounded"></div>
              </div>
              <div className="p-6 space-y-4">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div
                    key={j}
                    className="h-20 w-full bg-gray-200 dark:bg-gray-700 rounded-lg"
                  ></div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertTriangle className="h-16 w-16 text-red-500 mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
          Failed to Load Chat Metrics
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          We couldn't fetch the chat analytics data. Please check your
          connection and try again.
        </p>
        <button
          onClick={fetchChatMetrics}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Metrics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          icon={MessageCircle}
          title={`Open ${chatTypeInfo.plural}`}
          value={metrics.totalOpenChats}
          subtitle={`Currently Active ${chatTypeInfo.plural}`}
          type="count"
        />

        <MetricCard
          icon={Clock}
          title="Average Age"
          value={formatHours(metrics.averageAgeInHours)}
          subtitle="Since Last Activity"
          type="age"
        />

        <MetricCard
          icon={TrendingUp}
          title="Oldest Chat"
          value={formatHours(metrics.maxAgeInHours)}
          subtitle="Needs Attention"
          type="age"
        />

        <MetricCard
          icon={AlertTriangle}
          title="Overdue"
          value={metrics.chatsWithDelayedResponse}
          subtitle="24+ Hours Without Reply"
          type="delayed"
        />
      </div>

      {/* Filter Badge for Custom Property */}
      {customPropertyValue && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 flex items-center">
          <div className="flex-1">
            <span className="text-blue-700 dark:text-blue-300 font-medium">
              Custom Property Filter:
            </span>
            <span className="ml-2 text-blue-800 dark:text-blue-200">
              {customPropertyValue}
            </span>
          </div>
        </div>
      )}

      {/* Detailed Chat Lists */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* Open Chats Details */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border overflow-hidden">
          <button
            onClick={() => toggleSection("openChats")}
            className="w-full p-6 text-left border-b border-gray-200 dark:border-gray-700 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <MessageCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  Open {chatTypeInfo.plural}
                </h3>
                <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800 dark:bg-blue-800/30 dark:text-blue-200">
                  {metrics.openChatDetails.length}
                </span>
              </div>
              {expandedSections.openChats ? (
                <ChevronUp className="h-5 w-5 text-gray-500" />
              ) : (
                <ChevronDown className="h-5 w-5 text-gray-500" />
              )}
            </div>
          </button>

          {expandedSections.openChats && (
            <div className="p-6">
              {metrics.openChatDetails.length === 0 ? (
                <div className="text-center py-12">
                  <MessageCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400">
                    No open {chatType} chats found
                  </p>
                </div>
              ) : (
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {metrics.openChatDetails.slice(0, 20).map((chat, index) => (
                    <ChatCard
                      key={`open-${index}`}
                      chat={chat}
                      index={index}
                      type="open"
                    />
                  ))}
                  {metrics.openChatDetails.length > 20 && (
                    <div className="text-center pt-4">
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        ... and {metrics.openChatDetails.length - 20} more chats
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Delayed Response Details */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border overflow-hidden">
          <button
            onClick={() => toggleSection("delayedChats")}
            className="w-full p-6 text-left border-b border-gray-200 dark:border-gray-700 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  Overdue Responses
                </h3>
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
                    metrics.delayedResponseDetails.length > 0
                      ? "bg-red-100 text-red-800 dark:bg-red-800/30 dark:text-red-200"
                      : "bg-green-100 text-green-800 dark:bg-green-800/30 dark:text-green-200"
                  }`}
                >
                  {metrics.delayedResponseDetails.length}
                </span>
              </div>
              {expandedSections.delayedChats ? (
                <ChevronUp className="h-5 w-5 text-gray-500" />
              ) : (
                <ChevronDown className="h-5 w-5 text-gray-500" />
              )}
            </div>
          </button>

          {expandedSections.delayedChats && (
            <div className="p-6">
              {metrics.delayedResponseDetails.length === 0 ? (
                <div className="text-center py-12">
                  <div className="h-16 w-16 bg-green-100 dark:bg-green-800/30 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-2xl">🎉</span>
                  </div>
                  <h4 className="text-lg font-semibold text-green-700 dark:text-green-400 mb-2">
                    All Caught Up!
                  </h4>
                  <p className="text-green-600 dark:text-green-500">
                    No delayed responses. Great job keeping up with customer
                    inquiries!
                  </p>
                </div>
              ) : (
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {metrics.delayedResponseDetails.map((chat, index) => (
                    <ChatCard
                      key={`delayed-${index}`}
                      chat={chat}
                      index={index}
                      type="delayed"
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}