import React, { forwardRef, useRef } from "react";
import { StyleSheet } from "react-native";
import { LeafletView, LeafletWebViewMessage } from "react-native-leaflet-view";

const LeafletMap = forwardRef(({ roadData, routeCoords, initialRegion }, ref) => {
  const mapRef = useRef(null);

  return (
    <LeafletView
  ref={ref || mapRef}
  style={styles.map}
  onMessage={() => {}}
  mapCenterPosition={{ lat: initialRegion.latitude, lng: initialRegion.longitude }}
  zoom={15}
  mapShapes={[
    // ✅ Road network layer
    ...(roadData ? [{
      id: "roads",
      shapeType: "polyline",
      color: "red",
      weight: 2,
      positions: roadData.features.flatMap(f => f.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })))
    }] : []),

    // ✅ Route polyline
    ...(routeCoords?.length >= 2 ? [{
      id: "route",
      shapeType: "polyline",
      color: "blue",
      weight: 4,
      positions: routeCoords.map(p => ({ lat: p.latitude, lng: p.longitude }))
    }] : []),
  ]}
/>
  );
});

const styles = StyleSheet.create({
  map: { flex: 1 },
});

export default LeafletMap;
