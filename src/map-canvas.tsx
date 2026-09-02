import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ArrowUpRight, MapPin, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { setMapViewport } from "./map-viewport";
import { useResearch } from "./research-context";
import type { MapMarker, MapViewData } from "./types";

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const DEFAULT_ZOOM = 11;
const FIT_MAX_ZOOM = 13;

function markerIcon(index: number, isFocused: boolean) {
  const pin = document.createElement("span");
  pin.className = `map-pin${isFocused ? " focused" : ""}`;
  const badge = document.createElement("b");
  badge.textContent = String(index + 1);
  pin.append(badge);
  return L.divIcon({
    className: "map-pin-wrap",
    html: pin.outerHTML,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
    popupAnchor: [0, -24],
  });
}

/** Agent-provided marker text is untrusted, so the popup is built as DOM nodes rather than an HTML string. */
function markerPopup(marker: MapMarker) {
  const root = document.createElement("div");
  root.className = "map-popup";

  const title = document.createElement("strong");
  title.textContent = marker.label;
  root.append(title);

  const coords = document.createElement("span");
  coords.className = "map-popup-coords";
  coords.textContent = `${marker.lat.toFixed(4)}, ${marker.lng.toFixed(4)}`;
  root.append(coords);

  if (marker.note) {
    const note = document.createElement("p");
    note.textContent = marker.note;
    root.append(note);
  }

  if (marker.sourceUrl) {
    const link = document.createElement("a");
    link.href = marker.sourceUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = marker.sourceLabel ?? "Open source";
    root.append(link);
  }

  return root;
}

export function MapCanvasView({ data }: { data: MapViewData }) {
  const { setSelectedNodeId, removeVisualizationCard } = useResearch();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map>(null);
  const layerRef = useRef<L.LayerGroup>(null);
  const markerRefs = useRef(new Map<string, L.Marker>());

  const markers = useMemo(() => data.markers ?? [], [data.markers]);
  const markerKey = JSON.stringify(markers.map((marker) => [marker.id, marker.lat, marker.lng, marker.label, marker.note]));
  const viewKey = JSON.stringify([data.center, data.zoom, data.focusMarkerId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;
    const markerStore = markerRefs.current;

    const map = L.map(container, {
      center: [0, 0],
      zoom: 2,
      zoomControl: true,
      attributionControl: true,
      worldCopyJump: true,
    });
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19, crossOrigin: true }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    const publishViewport = () => {
      const center = map.getCenter();
      const bounds = map.getBounds();
      setMapViewport({
        center: { lat: Number(center.lat.toFixed(6)), lng: Number(center.lng.toFixed(6)) },
        zoom: map.getZoom(),
        bounds: {
          north: Number(bounds.getNorth().toFixed(6)),
          south: Number(bounds.getSouth().toFixed(6)),
          east: Number(bounds.getEast().toFixed(6)),
          west: Number(bounds.getWest().toFixed(6)),
        },
        visibleMarkerIds: [...markerStore.entries()]
          .filter(([, instance]) => bounds.contains(instance.getLatLng()))
          .map(([id]) => id),
      });
    };
    map.on("moveend zoomend", publishViewport);

    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);

    return () => {
      observer.disconnect();
      map.off("moveend zoomend", publishViewport);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      markerStore.clear();
      setMapViewport(undefined);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    markerRefs.current.clear();
    markers.forEach((marker, index) => {
      const instance = L.marker([marker.lat, marker.lng], {
        icon: markerIcon(index, marker.id === data.focusMarkerId),
        title: marker.label,
        alt: marker.label,
        keyboard: false,
      });
      instance.bindPopup(markerPopup(marker));
      instance.on("click", () => marker.sourceNodeIds?.[0] && setSelectedNodeId(marker.sourceNodeIds[0]));
      instance.addTo(layer);
      markerRefs.current.set(marker.id, instance);
    });
    map.fire("moveend");
  }, [markerKey, data.focusMarkerId, markers, setSelectedNodeId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !markers.length) return;

    const focused = data.focusMarkerId && markers.find((marker) => marker.id === data.focusMarkerId);
    if (focused) {
      map.flyTo([focused.lat, focused.lng], Math.max(data.zoom ?? DEFAULT_ZOOM, map.getZoom()), { duration: 0.6 });
      markerRefs.current.get(focused.id)?.openPopup();
      return;
    }
    if (data.center) {
      map.flyTo([data.center.lat, data.center.lng], data.zoom ?? DEFAULT_ZOOM, { duration: 0.6 });
      return;
    }
    const bounds = L.latLngBounds(markers.map((marker) => [marker.lat, marker.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: data.zoom ?? FIT_MAX_ZOOM, animate: false });
  }, [viewKey, markerKey, markers, data.center, data.zoom, data.focusMarkerId]);

  const focusMarker = (marker: MapMarker) => {
    const map = mapRef.current;
    if (map) {
      map.flyTo([marker.lat, marker.lng], Math.max(map.getZoom(), DEFAULT_ZOOM), { duration: 0.6 });
      markerRefs.current.get(marker.id)?.openPopup();
    }
    if (marker.sourceNodeIds?.[0]) setSelectedNodeId(marker.sourceNodeIds[0]);
  };

  return (
    <div className="visualization map-view" data-canvas-type="map">
      <div className="map-surface" ref={containerRef} role="application" aria-label="Research map" />
      <ol className="map-legend" aria-label="Map locations">
        {markers.map((marker, index) => (
          <li key={marker.id} data-map-marker-id={marker.id}>
            <button className="map-legend-item" onClick={() => focusMarker(marker)}>
              <span className="map-legend-index">{index + 1}</span>
              <span className="map-legend-copy">
                <strong>{marker.label}</strong>
                {marker.note && <p>{marker.note}</p>}
                <em>{marker.lat.toFixed(3)}, {marker.lng.toFixed(3)}</em>
              </span>
            </button>
            {marker.sourceUrl && (
              <a className="map-legend-source" href={marker.sourceUrl} target="_blank" rel="noreferrer">
                {marker.sourceLabel ?? "Source"}<ArrowUpRight size={11} />
              </a>
            )}
            <button
              className="visual-card-delete"
              onClick={() => removeVisualizationCard(marker.id)}
              aria-label={`Remove map marker ${marker.label}`}
            >
              <X size={13} />
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

export const MapCanvasIcon = MapPin;
