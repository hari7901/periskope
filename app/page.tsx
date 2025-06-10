// app/page.tsx
"use client";

import { useEffect, useState } from "react";
import TimeFilter from "./components/time-filter";
import DateRangePicker from "./components/date-range-picker";
import HeatMap from "./components/heatmap";
import ChatAnalytics from "./components/chat-analytics";

import {
  getDateRange,
  formatDateForAPI,
  groupMessagesByDayAndHour,
  calculateAveragePerDay,
  getPeakHour,
  getMostActiveDay,
  formatHourRange,
  computeAverageReplyDelay,
} from "./lib/utils";
import type { Message } from "./lib/types/periskope";

const timePeriodLabels: Record<string, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last7days: "Last 7 Days",
  last30days: "Last 30 Days",
  thisMonth: "This Month",
  lastMonth: "Last Month",
  custom: "Custom Range",
};

const agents = [
  { label: "All Agents", value: "" },
  { label: "+91 85270 33886", value: "918527033886@c.us" },
  { label: "+91 73034 61744", value: "917303461744@c.us" },
  { label: "+91 85274 39222", value: "918527439222@c.us" },
];

type HeatmapView = "all" | "agent" | "customer";
const viewLabels: Record<HeatmapView, string> = {
  all: "All Messages",
  agent: "Agent Sent",
  customer: "Customer Received",
};

type TabType = "messages" | "chats";

const chatTypes = [
  { label: "User Chats", value: "user" },
  { label: "Group Chats", value: "group" },
  { label: "Business Chats", value: "business" },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabType>("messages");
  const [chatType, setChatType] = useState("group"); // Default to group chats
  const [timeFilter, setTimeFilter] =
    useState<keyof typeof timePeriodLabels>("last7days");
  const [startDateISO, setStartDateISO] = useState("");
  const [endDateISO, setEndDateISO] = useState("");
  const [orgPhone, setOrgPhone] = useState("");
  const [agent, setAgent] = useState("");
  const [customPropertyValue, setCustomPropertyValue] = useState("");
  const [availableCustomValues, setAvailableCustomValues] = useState<string[]>(
    []
  );
  const [loadingCustomValues, setLoadingCustomValues] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [heatAll, setHeatAll] = useState<any>({});
  const [heatAgent, setHeatAgent] = useState<any>({});
  const [heatCustomer, setHeatCustomer] = useState<any>({});
  const [heatmapView, setHeatmapView] = useState<HeatmapView>("all");
  const [loading, setLoading] = useState(true);

  // initialize last 7 days
  useEffect(() => {
    const { startDate, endDate } = getDateRange("last7days");
    setStartDateISO(startDate.toISOString().slice(0, 10));
    setEndDateISO(endDate.toISOString().slice(0, 10));

    // Fetch available custom property values on initial load
    fetchAvailableCustomPropertyValues();
  }, []);

  // Fetch available values for the custom property
  async function fetchAvailableCustomPropertyValues() {
    setLoadingCustomValues(true);
    try {
      const res = await fetch(
        "/api/custom-property-values?propertyId=property-mhpfkllsoayiisiq"
      );
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      setAvailableCustomValues(data.values || []);
    } catch (error) {
      console.error("Error fetching custom property values:", error);
      setAvailableCustomValues([]);
    } finally {
      setLoadingCustomValues(false);
    }
  }

  // re-fetch on any filter change (only for messages tab)
  useEffect(() => {
    if (activeTab === "messages") {
      fetchMessages();
    } else {
      setLoading(false); // Don't show loading for chat analytics tab
    }
  }, [
    timeFilter,
    startDateISO,
    endDateISO,
    orgPhone,
    agent,
    customPropertyValue,
    activeTab,
  ]);

  async function fetchMessages() {
    setLoading(true);
    try {
      let s: Date, e: Date;
      if (timeFilter === "custom") {
        s = new Date(startDateISO);
        e = new Date(endDateISO);
        s.setHours(0, 0, 0, 0);
        e.setHours(23, 59, 59, 999);
      } else {
        ({ startDate: s, endDate: e } = getDateRange(timeFilter));
      }

      const sISO = formatDateForAPI(s);
      const eISO = formatDateForAPI(e);
      let url = `/api/messages?startTime=${encodeURIComponent(
        sISO
      )}&endTime=${encodeURIComponent(eISO)}&limit=2000`;

      if (orgPhone.trim())
        url += `&orgPhone=${encodeURIComponent(orgPhone.trim())}`;

      // Add custom property filter if selected
      if (customPropertyValue) {
        url += `&customPropertyId=property-mhpfkllsoayiisiq&customPropertyValue=${encodeURIComponent(
          customPropertyValue
        )}`;
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      const raw: Message[] = Array.isArray(data.messages) ? data.messages : [];

      // apply agent filter
      const filtered = agent
        ? raw.filter((m) => m.sender_phone === agent)
        : raw;

      setMessages(filtered);
      // build three heatmaps
      setHeatAll(groupMessagesByDayAndHour(filtered));
      setHeatAgent(
        groupMessagesByDayAndHour(filtered.filter((m) => m.from_me))
      );
      setHeatCustomer(
        groupMessagesByDayAndHour(filtered.filter((m) => !m.from_me))
      );
    } catch {
      setMessages([]);
      setHeatAll({});
      setHeatAgent({});
      setHeatCustomer({});
    } finally {
      setLoading(false);
    }
  }

  // compute stats for messages tab
  const totalCount = messages.length;
  const agentCount = messages.filter((m) => m.from_me).length;
  const { avgAbsoluteMs, avgBusinessMs } = computeAverageReplyDelay(messages);
  const { startDate, endDate } =
    timeFilter === "custom"
      ? { startDate: new Date(startDateISO), endDate: new Date(endDateISO) }
      : getDateRange(timeFilter);
  const avgPerDay = calculateAveragePerDay(messages, { startDate, endDate });

  const currentHeat =
    heatmapView === "agent"
      ? heatAgent
      : heatmapView === "customer"
      ? heatCustomer
      : heatAll;
  const { hour: peakHour } = getPeakHour(currentHeat);
  const peakRange = formatHourRange(peakHour);
  const { day: peakDay } = getMostActiveDay(currentHeat);

  const renderMessagesTab = () => (
    <div className="space-y-8">
      {/* stats grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 animate-pulse">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 space-y-2"
            >
              <div className="h-4 w-1/3 bg-gray-200 dark:bg-gray-700 rounded"></div>
              <div className="h-8 w-2/3 bg-gray-200 dark:bg-gray-700 rounded"></div>
              <div className="h-3 w-1/4 bg-gray-200 dark:bg-gray-700 rounded"></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
          {/* Total Messages */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 text-center">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Total Messages
            </h3>
            <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-100">
              {totalCount.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {timePeriodLabels[timeFilter]}
            </p>
          </div>
          {/* Agent Messages */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 text-center">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Agent Messages
            </h3>
            <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-100">
              {agentCount.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {agent
                ? agents.find((a) => a.value === agent)?.label
                : "All Agents"}
            </p>
          </div>
          {/* Avg/Day */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 text-center">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Avg Messages/Day
            </h3>
            <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-100">
              {avgPerDay.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {timePeriodLabels[timeFilter]}
            </p>
          </div>
          {/* Peak */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 text-center">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Peak Activity
            </h3>
            <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
              {peakRange}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              on {peakDay}
            </p>
          </div>
          {/* Avg Reply Absolute */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 text-center">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Avg Reply Delay
            </h3>
            <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
              {Math.round(avgAbsoluteMs / 60000)} min
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              absolute
            </p>
          </div>
          {/* Avg Reply Business */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 text-center">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Avg Reply Delay
            </h3>
            <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
              {Math.round(avgBusinessMs / 60000)} min
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              business hrs
            </p>
          </div>
        </div>
      )}

      {/* heatmap view toggle */}
      <div className="flex space-x-2">
        {(["all", "agent", "customer"] as HeatmapView[]).map((v) => (
          <button
            key={v}
            onClick={() => setHeatmapView(v)}
            className={`px-4 py-2 rounded-full text-sm font-medium ${
              heatmapView === v
                ? "bg-blue-500 text-white"
                : "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
            }`}
          >
            {viewLabels[v]}
          </button>
        ))}
      </div>

      {/* heatmap */}
      <div className="rounded-xl bg-white p-6 shadow dark:bg-gray-800">
        {loading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-6 w-1/3 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-64 w-full bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        ) : (
          <HeatMap
            data={currentHeat}
            title={`Message Volume by Day & Hour (${timePeriodLabels[timeFilter]} – ${viewLabels[heatmapView]})`}
          />
        )}
      </div>
    </div>
  );

  const renderChatsTab = () => (
    <div className="space-y-8">
      <ChatAnalytics orgPhone={orgPhone} agent={agent} chatType={chatType} />
    </div>
  );

  return (
    <div className="min-h-screen p-8 sm:p-20 font-inter">
      <main className="mx-auto max-w-7xl space-y-8">
        {/* header */}
        <header className="flex flex-col sm:flex-row justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">
            WhatsApp Analytics
          </h1>
          <p className="mt-2 sm:mt-0 text-gray-600 dark:text-gray-400">
            Filter by Org Phone, Agent, Custom Property & Time Range
          </p>
        </header>

        {/* filters */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div>
            <label className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
              Org Phone
            </label>
            <input
              className="w-full border rounded p-2 bg-white dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
              placeholder="918527184400@c.us"
              value={orgPhone}
              onChange={(e) => setOrgPhone(e.target.value)}
            />
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
              Agent
            </label>
            <select
              className="w-full border rounded p-2 bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
            >
              {agents.map((a) => (
                <option
                  key={a.value}
                  value={a.value}
                  className="bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                >
                  {a.label}
                </option>
              ))}
            </select>
          </div>

          {/* Add Custom Property Filter */}
          <div>
            <label className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
              Custom Property
            </label>
            <select
              className="w-full border rounded p-2 bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
              value={customPropertyValue}
              onChange={(e) => setCustomPropertyValue(e.target.value)}
              disabled={loadingCustomValues}
            >
              <option value="">All Values</option>
              {availableCustomValues.map((value) => (
                <option
                  key={value}
                  value={value}
                  className="bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                >
                  {value}
                </option>
              ))}
            </select>
            {loadingCustomValues && (
              <p className="text-xs text-gray-500 mt-1">Loading values...</p>
            )}
          </div>

          {activeTab === "chats" && (
            <div>
              <label className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                Chat Type
              </label>
              <select
                className="w-full border rounded p-2 bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                value={chatType}
                onChange={(e) => setChatType(e.target.value)}
              >
                {chatTypes.map((type) => (
                  <option
                    key={type.value}
                    value={type.value}
                    className="bg-white text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                  >
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <section className="space-y-4">
            <TimeFilter
              selectedFilter={timeFilter}
              onFilterChange={(f) => setTimeFilter(f as any)}
            />
            <DateRangePicker
              startDate={startDateISO}
              endDate={endDateISO}
              onStartDateChange={setStartDateISO}
              onEndDateChange={setEndDateISO}
              isVisible={timeFilter === "custom"}
            />
          </section>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab("messages")}
              className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === "messages"
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
              }`}
            >
              📊 Message Analytics
            </button>
            <button
              onClick={() => setActiveTab("chats")}
              className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === "chats"
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
              }`}
            >
              💬 Chat Analytics
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === "messages" ? renderMessagesTab() : renderChatsTab()}
      </main>
    </div>
  );
}
