import { useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip, Marker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const COLORS = ["#111315", "#868E96", "#5C636A", "#343A40", "#5C636A", "#868E96"];

const driverIcon = L.divIcon({
  className: "",
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#111315;border:2px solid #fff;box-shadow:0 0 0 2px #111315"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

export default function MiniRouteMap({ routes = [], height = 240 }) {
  const allPoints = useMemo(() => {
    const pts = [];
    routes.forEach((r) => {
      (r.stops || []).forEach((s) => pts.push([s.lat, s.lng]));
      if (r.driver) pts.push([r.driver.lat, r.driver.lng]);
    });
    return pts;
  }, [routes]);

  if (allPoints.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-xl bg-[#F1F3F5] text-[12px] text-[#868E96]"
        style={{ height }}
      >
        No geocoded stops to map
      </div>
    );
  }

  const lats = allPoints.map((p) => p[0]);
  const lngs = allPoints.map((p) => p[1]);
  const bounds = [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)],
  ];

  return (
    <div className="rounded-xl overflow-hidden border border-black/[0.06]" style={{ height }}>
      <MapContainer
        bounds={bounds}
        boundsOptions={{ padding: [20, 20] }}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; OpenStreetMap'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {routes.flatMap((r, i) => {
          const color = COLORS[i % COLORS.length];
          const line = (r.stops || []).map((s) => [s.lat, s.lng]);
          const children = [];
          if (line.length >= 2) {
            children.push(
              <Polyline
                key={`${r.job_id}-line`}
                positions={line}
                pathOptions={{ color, weight: 3, opacity: 0.7 }}
              />
            );
          }
          (r.stops || []).forEach((s) => {
            children.push(
              <CircleMarker
                key={`${r.job_id}-${s.id}`}
                center={[s.lat, s.lng]}
                radius={6}
                pathOptions={{
                  color: "#fff",
                  weight: 2,
                  fillColor: s.completed ? "#5C636A" : color,
                  fillOpacity: 1,
                }}
              >
                <Tooltip>
                  <div className="text-[11px]">
                    <strong>#{s.stop_number}</strong> {s.customer_name || s.id}
                    {s.address && <div className="text-[10px] text-[#868E96]">{s.address}</div>}
                  </div>
                </Tooltip>
              </CircleMarker>
            );
          });
          if (r.driver) {
            children.push(
              <Marker
                key={`${r.job_id}-driver`}
                position={[r.driver.lat, r.driver.lng]}
                icon={driverIcon}
              >
                <Tooltip>{r.driver.name}</Tooltip>
              </Marker>
            );
          }
          return children;
        })}
      </MapContainer>
    </div>
  );
}
