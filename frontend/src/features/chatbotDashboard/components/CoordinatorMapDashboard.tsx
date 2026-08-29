import { useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, ZoomControl } from "react-leaflet";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Loader2, MapPin, Users, MessageSquare, CheckCircle } from "lucide-react";
import { useCoordinatorFarmerGeo, type CoordinatorFarmerGeo } from "../hooks/useCoordinatorFarmerGeo";
import { useAuthStore } from "@/stores/auth-store";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";

function createFarmerIcon(questions: number): L.DivIcon {
  const color = questions === 0 ? "#9ca3af" : questions < 5 ? "#f59e0b" : "#16a34a";
  return L.divIcon({
    className: "",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14],
    html: `<div style="width:24px;height:24px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
    </div>`,
  });
}

const noLocationIcon = L.divIcon({
  className: "",
  iconSize: [0, 0],
  iconAnchor: [0, 0],
  html: "",
});

function FarmerPopup({ farmer }: { farmer: CoordinatorFarmerGeo }) {
  const p = farmer.farmerProfile;
  return (
    <div className="min-w-[200px] text-sm space-y-1">
      <p className="font-semibold text-base">{farmer.name || p.farmerName || "Unknown"}</p>
      <p className="text-muted-foreground">{p.villageName}, {p.blockName}, {p.district}</p>
      {p.primaryCrop && <p className="text-muted-foreground">Crop: {p.primaryCrop}</p>}
      <div className="flex gap-3 pt-1 text-xs">
        <span className="flex items-center gap-1"><MessageSquare size={12} /> {farmer.totalQuestions} Q</span>
        <span className="flex items-center gap-1"><CheckCircle size={12} /> {farmer.closedQuestions} closed</span>
      </div>
      {farmer.lastQuestionAt && (
        <p className="text-xs text-muted-foreground pt-1">
          Last active: {new Date(farmer.lastQuestionAt).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}

function StatsBar({ stats }: { stats: { total: number; withLocation: number; totalQuestions: number } }) {
  return (
    <div className="flex gap-4 p-3 bg-card/80 border border-border rounded-lg text-sm">
      <div className="flex items-center gap-1.5">
        <Users size={14} className="text-muted-foreground" />
        <span className="font-medium">{stats.total}</span>
        <span className="text-muted-foreground">farmers</span>
      </div>
      <div className="flex items-center gap-1.5">
        <MapPin size={14} className="text-muted-foreground" />
        <span className="font-medium">{stats.withLocation}</span>
        <span className="text-muted-foreground">on map</span>
      </div>
      <div className="flex items-center gap-1.5">
        <MessageSquare size={14} className="text-muted-foreground" />
        <span className="font-medium">{stats.totalQuestions}</span>
        <span className="text-muted-foreground">questions</span>
      </div>
    </div>
  );
}

export default function CoordinatorMapDashboard() {
  const { user } = useAuthStore();
  const { data: currentUser } = useGetCurrentUser({ enabled: !!user });
  const coordinatorId = currentUser?.userId ?? currentUser?._id ?? "";
  const { data, isLoading } = useCoordinatorFarmerGeo(coordinatorId, Boolean(coordinatorId));
  const [hoveredFarmer, setHoveredFarmer] = useState<string | null>(null);

  const farmersWithLocation = useMemo(
    () => data?.farmers.filter((f) => f.location?.latitude && f.location?.longitude) ?? [],
    [data],
  );

  const center = useMemo(() => {
    if (farmersWithLocation.length === 0) return [20.5937, 78.9629] as [number, number];
    const avgLat = farmersWithLocation.reduce((s, f) => s + f.location!.latitude, 0) / farmersWithLocation.length;
    const avgLng = farmersWithLocation.reduce((s, f) => s + f.location!.longitude, 0) / farmersWithLocation.length;
    return [avgLat, avgLng] as [number, number];
  }, [farmersWithLocation]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="animate-spin text-muted-foreground" size={32} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4 h-full">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Farmer Map</h2>
        {data?.scope?.district && (
          <span className="text-sm text-muted-foreground">
            {data.scope.district}{data.scope.block ? ` / ${data.scope.block}` : ""}
          </span>
        )}
      </div>

      {data?.stats && <StatsBar stats={data.stats} />}

      <div className="flex-1 rounded-lg overflow-hidden border border-border relative" style={{ minHeight: 400 }}>
        <MapContainer
          center={center}
          zoom={farmersWithLocation.length > 0 ? 10 : 5}
          zoomControl={false}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={true}
        >
          <ZoomControl position="topright" />
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />
          {farmersWithLocation.map((farmer) => (
            <Marker
              key={farmer.userId}
              position={[farmer.location!.latitude, farmer.location!.longitude]}
              icon={createFarmerIcon(farmer.totalQuestions)}
              eventHandlers={{
                mouseover: () => setHoveredFarmer(farmer.userId),
                mouseout: () => setHoveredFarmer(null),
              }}
            >
              <Popup>
                <FarmerPopup farmer={farmer} />
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        {farmersWithLocation.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <p className="text-muted-foreground text-sm">No farmers with GPS data found</p>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-gray-400 inline-block" /> No questions
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-amber-500 inline-block" /> 1-4 questions
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full bg-green-600 inline-block" /> 5+ questions
        </span>
      </div>
    </div>
  );
}
