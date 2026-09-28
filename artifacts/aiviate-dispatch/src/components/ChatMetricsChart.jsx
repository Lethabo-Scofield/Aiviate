import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

function parseMetric(item) {
  if (!item || typeof item.label !== "string" || !item.label.trim()) return null;
  const input = item.value;
  if (typeof input !== "number" && typeof input !== "string") return null;
  const raw = typeof input === "string" ? input.trim() : input;
  if (raw === "") return null;
  // Allow ordinary numeric strings, including correctly grouped thousands.
  const normalized = typeof raw === "string"
    ? (/^\d{1,3}(,\d{3})+(?:\.\d+)?$/.test(raw) ? raw.replaceAll(",", "") : raw)
    : raw;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return { label: item.label.trim(), value, display: String(raw) };
}

function CategoryTick({ x, y, payload }) {
  const words = String(payload.value).split(/\s+/);
  const lines = [];
  words.forEach((word) => {
    if (!lines.length || `${lines[lines.length - 1]} ${word}`.length > 18) lines.push(word);
    else lines[lines.length - 1] += ` ${word}`;
  });
  return (
    <text x={x - 8} y={y} textAnchor="end" dominantBaseline="middle" fill="#5C636A" fontSize={11}>
      {lines.map((line, index) => (
        <tspan key={`${line}-${index}`} x={x - 8} dy={index === 0 ? -(lines.length - 1) * 6 : 12}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

function ValueLabel({ x, y, width, height, index, data }) {
  const metric = data[index];
  if (!metric) return null;
  return (
    <text
      x={x + width + 8}
      y={y + height / 2}
      dominantBaseline="middle"
      fill="#273236"
      fontSize={11}
      fontWeight={600}
    >
      {metric.display}
    </text>
  );
}

/** The chart uses only the numeric metrics provided by the command result. */
export default function ChatMetricsChart({ items }) {
  const data = (Array.isArray(items) ? items : []).map(parseMetric).filter(Boolean);
  if (!data.length) return null;

  const description = data.map(({ label, display }) => `${label}: ${display}`).join("; ");

  return (
    <div
      className="w-full rounded-xl border border-[#E9ECEF] bg-[#FCFDFC] px-2 py-3 sm:px-3"
      role="img"
      aria-label={`Operation metrics. ${description}.`}
      data-testid="chart-chat-metrics"
    >
      <div className="w-full" style={{ height: Math.max(112, data.length * 48 + 32) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 8, right: 58, bottom: 8, left: 4 }}
            barCategoryGap="45%"
            accessibilityLayer
          >
            <CartesianGrid horizontal={false} stroke="#EEF1F2" />
            <XAxis type="number" domain={[0, "auto"]} hide />
            <YAxis
              type="category"
              dataKey="label"
              width={124}
              axisLine={false}
              tickLine={false}
              tick={<CategoryTick />}
              interval={0}
            />
            <Tooltip
              cursor={{ fill: "#F1F3F5" }}
              formatter={(_value, _name, entry) => [entry?.payload?.display ?? "", entry?.payload?.label ?? "Count"]}
              contentStyle={{ border: "1px solid #E9ECEF", borderRadius: 8, background: "#FCFDFC", fontSize: 12 }}
            />
            <Bar dataKey="value" fill="#617680" maxBarSize={19} radius={[0, 4, 4, 0]} isAnimationActive={false}>
              <LabelList content={(props) => <ValueLabel {...props} data={data} />} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}