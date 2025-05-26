// app/components/custom-property-chart.tsx

import { useEffect, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";
import { AlertTriangle, InfoIcon } from "lucide-react";

interface CustomPropertyChartProps {
  propertyId: string;
  chatType?: string;
}

export default function CustomPropertyChart({
  propertyId,
  chatType,
}: CustomPropertyChartProps) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMockData, setIsMockData] = useState(false);

  const COLORS = [
    "#0088FE",
    "#00C49F",
    "#FFBB28",
    "#FF8042",
    "#8884D8",
    "#4CAF50",
    "#E91E63",
    "#9C27B0",
    "#673AB7",
    "#3F51B5",
  ];

  useEffect(() => {
    fetchCustomPropertyDistribution();
  }, [propertyId, chatType]);

  async function fetchCustomPropertyDistribution() {
    setLoading(true);
    setError(null);
    setIsMockData(false);
    try {
      const params = new URLSearchParams();
      params.append("propertyId", propertyId);
      if (chatType) {
        params.append("chatType", chatType);
      }

      console.log(
        "Fetching from URL:",
        `/api/custom-property-distribution?${params.toString()}`
      );

      const res = await fetch(
        `/api/custom-property-distribution?${params.toString()}`
      );

      if (!res.ok) {
        const errorText = await res.text().catch(() => "Unknown error");
        throw new Error(`API error: ${res.status} - ${errorText}`);
      }

      const result = await res.json();
      console.log("Custom property distribution data:", result);

      // Check if it's mock data
      if (result._debug && result._debug.isMockData) {
        setIsMockData(true);
      }

      setData(result.distribution || []);
    } catch (error: any) {
      console.error("Error fetching custom property distribution:", error);
      setError(error.message || "Failed to fetch data");
      setData([]);
    } finally {
      setLoading(false);
    }
  }

  const renderCustomizedLabel = ({
    cx,
    cy,
    midAngle,
    innerRadius,
    outerRadius,
    percent,
    index,
    name,
  }: any) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return percent > 0.05 ? (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor={x > cx ? "start" : "end"}
        dominantBaseline="central"
        fontSize="12"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    ) : null;
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 animate-pulse">
        <div className="h-6 w-1/3 bg-gray-200 dark:bg-gray-700 rounded mb-6"></div>
        <div className="h-64 w-full bg-gray-200 dark:bg-gray-700 rounded"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 text-center">
        <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-2">
          Error Loading Chart
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
        <button
          onClick={fetchCustomPropertyDistribution}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 text-center">
        <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-4">
          Custom Property Distribution
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          No data available for this property
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200">
          Custom Property Distribution
        </h3>

        {isMockData && (
          <div className="flex items-center text-amber-600 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-300 px-3 py-1 rounded-full text-xs">
            <InfoIcon className="h-4 w-4 mr-1" />
            <span>Sample Data (No actual values found)</span>
          </div>
        )}
      </div>

      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={renderCustomizedLabel}
              outerRadius={120}
              fill="#8884d8"
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[index % COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => [`${value} chats`, "Count"]}
              contentStyle={{
                backgroundColor: "rgba(255, 255, 255, 0.9)",
                border: "1px solid #ccc",
                borderRadius: "6px",
                padding: "8px 12px",
              }}
              itemStyle={{ color: "#333" }}
            />
            <Legend
              layout="horizontal"
              verticalAlign="bottom"
              align="center"
              wrapperStyle={{ paddingTop: "20px" }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
