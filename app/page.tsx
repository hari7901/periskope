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
  last7days: "Last 7 Days",
  lastMonth: "Last Month (30 Days)",
  last3months: "Last 3 Months (90 Days)",
  custom: "Custom Range",
};

const agents = [
  { label: "All Agents", value: "" },
  { label: "+91 85270 33886", value: "918527033886@c.us" },
  { label: "+91 73034 61744", value: "917303461744@c.us" },
  { label: "+91 85274 39222", value: "918527439222@c.us" },
  { label: "+91 85270 14950", value: "918527014950@c.us" },
];

type HeatmapView = "all" | "agent" | "customer";
const viewLabels: Record<HeatmapView, string> = {
  all: "All Messages",
  agent: "Agent Sent",
  customer: "Customer Received",
};

type TabType = "messages" | "chats";

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<TabType>("messages");
  const [timeFilter, setTimeFilter] =
    useState<keyof typeof timePeriodLabels>("last7days");
  const [startDateISO, setStartDateISO] = useState("");
  const [endDateISO, setEndDateISO] = useState("");
  const [orgPhone, setOrgPhone] = useState("");
  const [agent, setAgent] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [heatAll, setHeatAll] = useState<any>({});
  const [heatAgent, setHeatAgent] = useState<any>({});
  const [heatCustomer, setHeatCustomer] = useState<any>({});
  const [heatmapView, setHeatmapView] = useState<HeatmapView>("all");
  const [loading, setLoading] = useState(true);
  const [currentFetchId, setCurrentFetchId] = useState<string>("");
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  // initialize last 7 days
  useEffect(() => {
    const { startDate, endDate } = getDateRange("last7days");
    setStartDateISO(startDate.toISOString().slice(0, 10));
    setEndDateISO(endDate.toISOString().slice(0, 10));
  }, []);

  // re-fetch on any filter change (only for messages tab) with debouncing
  useEffect(() => {
    if (activeTab !== "messages") {
      setLoading(false);
      return;
    }

    // Cancel any existing request
    if (abortController) {
      console.log("[HomePage] Cancelling previous request");
      abortController.abort();
    }

    // Debounce rapid filter changes
    const timeoutId = setTimeout(() => {
      fetchMessages();
    }, 300); // 300ms debounce

    return () => {
      clearTimeout(timeoutId);
    };
  }, [timeFilter, startDateISO, endDateISO, agent, activeTab]);

  // Update date inputs when time filter changes with debouncing
  useEffect(() => {
    if (timeFilter !== "custom") {
      const { startDate, endDate } = getDateRange(timeFilter);
      setStartDateISO(startDate.toISOString().slice(0, 10));
      setEndDateISO(endDate.toISOString().slice(0, 10));
    }
  }, [timeFilter]);

  async function fetchMessages() {
    // Cancel any existing request
    if (abortController) {
      console.log("[HomePage] Aborting previous fetch request");
      abortController.abort();
    }

    // Create new abort controller for this request
    const newAbortController = new AbortController();
    setAbortController(newAbortController);

    // Generate unique ID for this fetch request
    const fetchId = `${timeFilter}-${startDateISO}-${endDateISO}-${agent}-${Date.now()}`;
    
    console.log(`[HomePage] Starting SINGLE fetch ${fetchId}`);
    
    setCurrentFetchId(fetchId);
    setLoading(true);
    
    // Clear existing data immediately when starting new fetch
    setMessages([]);
    setHeatAll({});
    setHeatAgent({});
    setHeatCustomer({});
    
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
      
      // Increased limit for larger time ranges
      const daysDiff = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
      const limit = Math.max(10000, daysDiff * 500); // Dynamic limit based on time range
      
      let url = `/api/messages?startTime=${encodeURIComponent(
        sISO
      )}&endTime=${encodeURIComponent(eISO)}&limit=${limit}`;

      console.log(`[HomePage] Fetch ${fetchId} making SINGLE API call for ${daysDiff} days`);

      const res = await fetch(url, {
        signal: newAbortController.signal // Add abort signal
      });
      
      if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
      const data = await res.json();
      
      // Check if request was aborted
      if (newAbortController.signal.aborted) {
        console.log(`[HomePage] Fetch ${fetchId} was aborted`);
        return;
      }
      
      console.log(`[HomePage] Fetch ${fetchId} API response received`);
      
      const raw: Message[] = Array.isArray(data.messages) ? data.messages : [];
      console.log(`[HomePage] Fetch ${fetchId} completed: ${raw.length} total messages`);

      // Apply agent filter
      const filtered = agent
        ? raw.filter((m) => m.sender_phone === agent)
        : raw;

      console.log(`[HomePage] Fetch ${fetchId} after agent filter: ${filtered.length} messages`);

      // Check one more time if request was aborted before updating state
      if (newAbortController.signal.aborted) {
        console.log(`[HomePage] Fetch ${fetchId} aborted before state update`);
        return;
      }

      // Update state and clear loading
      setMessages(filtered);
      setHeatAll(groupMessagesByDayAndHour(filtered));
      setHeatAgent(groupMessagesByDayAndHour(filtered.filter((m) => m.from_me)));
      setHeatCustomer(groupMessagesByDayAndHour(filtered.filter((m) => !m.from_me)));
      
      console.log(`[HomePage] Fetch ${fetchId} state updated, setting loading to false`);
      setLoading(false);
      
      // Clear the abort controller since request completed successfully
      setAbortController(null);
      
    } catch (error: any) {
      // Don't log aborted requests as errors
      if (error.name === 'AbortError') {
        console.log(`[HomePage] Fetch ${fetchId} was cancelled`);
        return;
      }
      
      console.error(`[HomePage] Fetch ${fetchId} error:`, error);
      setMessages([]);
      setHeatAll({});
      setHeatAgent({});
      setHeatCustomer({});
      setLoading(false);
      setAbortController(null);
      console.log(`[HomePage] Fetch ${fetchId} error handled, loading set to false`);
    }
  }

  // compute stats for messages tab - only when data is loaded and not loading
  const shouldShowStats = !loading && messages.length >= 0;
  const totalCount = shouldShowStats ? messages.length : 0;
  const agentCount = shouldShowStats ? messages.filter((m) => m.from_me).length : 0;
  const customerCount = shouldShowStats ? messages.filter((m) => !m.from_me).length : 0;
  const { avgAbsoluteMs, avgBusinessMs } = shouldShowStats ? computeAverageReplyDelay(messages) : { avgAbsoluteMs: 0, avgBusinessMs: 0 };
  const { startDate, endDate } =
    timeFilter === "custom"
      ? { startDate: new Date(startDateISO), endDate: new Date(endDateISO) }
      : getDateRange(timeFilter);
  const avgPerDay = shouldShowStats ? calculateAveragePerDay(messages, { startDate, endDate }) : 0;

  const currentHeat = shouldShowStats 
    ? (heatmapView === "agent"
        ? heatAgent
        : heatmapView === "customer"
        ? heatCustomer
        : heatAll)
    : {};
  const { hour: peakHour } = shouldShowStats ? getPeakHour(currentHeat) : { hour: "0" };
  const peakRange = shouldShowStats ? formatHourRange(peakHour) : "--";
  const { day: peakDay } = shouldShowStats ? getMostActiveDay(currentHeat) : { day: "--" };

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
      ) : shouldShowStats ? (
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

          {/* Customer Messages */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 text-center">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Customer Messages
            </h3>
            <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-gray-100">
              {customerCount.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Received from customers
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
          
          {/* Peak Activity */}
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
          
          {/* Avg Reply Delay */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 text-center">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
              Avg Reply Delay
            </h3>
            <p className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
              {Math.round(avgAbsoluteMs / 60000)} min
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Response time
            </p>
          </div>
        </div>
      ) : null}

      {/* heatmap view toggle - only show when data is loaded */}
      {shouldShowStats && (
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
      )}

      {/* heatmap */}
      <div className="rounded-xl bg-white p-6 shadow dark:bg-gray-800">
        {loading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-6 w-1/3 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-64 w-full bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        ) : shouldShowStats ? (
          <HeatMap
            data={currentHeat}
            title={`Message Volume by Day & Hour (${timePeriodLabels[timeFilter]} – ${viewLabels[heatmapView]})`}
          />
        ) : (
          <div className="h-64 flex items-center justify-center">
            <div className="text-gray-500 dark:text-gray-400">
              No data available for the selected time period
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderChatsTab = () => (
    <div className="space-y-8">
      <ChatAnalytics orgPhone={orgPhone} />
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
            Comprehensive Message & Chat Analytics Dashboard
          </p>
        </header>

        {/* filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
              Org Phone (Chat Analytics Only)
            </label>
            <input
              className="w-full border rounded p-2 bg-white dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
              placeholder="918527184400@c.us"
              value={orgPhone}
              onChange={(e) => setOrgPhone(e.target.value)}
              disabled={activeTab === "messages"}
            />
            {activeTab === "messages" && (
              <p className="text-xs text-gray-500 mt-1">This filter only applies to Chat Analytics</p>
            )}
          </div>

          {activeTab === "messages" && (
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
          )}
        </div>

        {/* Time filters - only show for messages tab */}
        {activeTab === "messages" && (
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
        )}

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

        {/* Loading indicator for data fetching */}
        {loading && activeTab === "messages" && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="flex items-center space-x-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="text-lg font-medium text-gray-700 dark:text-gray-300">
                Fetching messages for {timePeriodLabels[timeFilter]}...
              </span>
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-md">
              Please wait while we collect all messages for the selected time period. 
              Stats will appear once the fetch is complete.
            </div>
          </div>
        )}

        {/* Tab Content */}
        {activeTab === "messages" ? renderMessagesTab() : renderChatsTab()}
      </main>
    </div>
  );
}