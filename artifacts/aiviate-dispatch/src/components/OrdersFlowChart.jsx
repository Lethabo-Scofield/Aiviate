import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, XAxis, YAxis } from "recharts";

const STATUSES = [
  { key: "fresh", name: "New", filter: "new", fill: "#273236" },
  { key: "imported", name: "Imported", filter: "imported", fill: "#7f8a90" },
  { key: "noAddress", name: "Missing address", filter: "attention", fill: "#bac3c7" },
];

export default function OrdersFlowChart({ counts, loading, onSelectStatus }) {
  const data = STATUSES.map((status) => ({
    ...status,
    count: Number(counts[status.key]) || 0,
  }));
  const total = data.reduce((sum, status) => sum + status.count, 0);

  return (
    <section className="apple-card mb-6 px-4 py-5 sm:px-6" aria-labelledby="order-flow-title">
      <h2 id="order-flow-title" className="text-[16px] font-semibold text-[#111315]">Order flow</h2>
      <p className="mt-1 text-[12px] text-[#868E96]">Store orders by dispatch status</p>

      {loading ? (
        <div className="mt-6 h-[225px] animate-pulse rounded-lg bg-[#F1F3F5]" aria-label="Loading order flow" />
      ) : (
        <div
          className="mt-5 h-[225px] w-full"
          role="img"
          aria-label={`Order flow: ${data.map(({ name, count }) => `${count} ${name.toLowerCase()}`).join(", ")}.`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 22, right: 8, left: -18, bottom: 0 }} accessibilityLayer>
              <CartesianGrid vertical={false} stroke="#eff1f2" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#667077", fontSize: 11 }} interval={0} />
              <YAxis allowDecimals={false} domain={[0, (max) => Math.max(1, max)]} axisLine={false} tickLine={false} tick={{ fill: "#9aa2a7", fontSize: 11 }} />
              <Bar
                dataKey="count"
                maxBarSize={72}
                radius={[5, 5, 0, 0]}
                cursor="pointer"
                onClick={(bar) => {
                  const filter = bar?.payload?.filter || bar?.filter;
                  if (filter) onSelectStatus(filter);
                }}
              >
                {data.map(({ key, fill }) => <Cell key={key} fill={fill} />)}
                <LabelList dataKey="count" position="top" style={{ fill: "#273236", fontSize: 12, fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {!loading && total === 0 && (
        <p className="mt-1 text-center text-[12px] text-[#868E96]">No store orders yet. The chart will fill as orders arrive.</p>
      )}
    </section>
  );
}