import { Ionicons } from '@expo/vector-icons';
import * as turf from '@turf/turf';
import * as Location from 'expo-location';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Modal, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import DropDownPicker from 'react-native-dropdown-picker';
import MapView, { Geojson, Marker, Polyline } from 'react-native-maps';
// import roadData from '../../assets/data/road2.0.json';
// import slotData from '../../assets/data/total.json';
import { FontAwesome5 } from '@expo/vector-icons';
import { GestureHandlerRootView, PanGestureHandler } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedGestureHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring
} from 'react-native-reanimated';

import { useLocalSearchParams } from "expo-router";
import * as Speech from "expo-speech";
import { getYardOrDefault } from "../../src/Yards.config";


// import Mapbox, { MapView, Camera, ShapeSource, LineLayer } from '@rnmapbox/maps';

export default function Explore() {

  const { yard: yardParam } = useLocalSearchParams();
  const yard = getYardOrDefault(yardParam);
  const roadData = yard.roadData;
  const slotData = yard.slotData;

  const [search, setSearch] = useState('');
  const [location, setLocation] = useState(null);
  const mapRef = useRef(null);

  const [showDirections, setShowDirections] = useState(false);

  // Pickup dropdown states
  const [pickupSlotOpen, setPickupSlotOpen] = useState(false);
  const [pickupSlot, setPickupSlot] = useState(null);
  const [pickupLotOpen, setPickupLotOpen] = useState(false);
  const [pickupLot, setPickupLot] = useState(null);

  // Drop dropdown states
  const [dropSlotOpen, setDropSlotOpen] = useState(false);
  const [dropSlot, setDropSlot] = useState(null);
  const [dropLotOpen, setDropLotOpen] = useState(false);
  const [dropLot, setDropLot] = useState(null);

  // Refs for graph & nodes
  const graph = useRef({});
  const nodeList = useRef({});
  const [routeCoords, setRouteCoords] = useState([]);

  const [distance, setDistance] = useState(null);
  const [eta, setEta] = useState(null);
  const [showRouteInfo, setShowRouteInfo] = useState(false);

  const [steps, setSteps] = useState([]);

  const [navActive, setNavActive] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const watcherRef = useRef(null);

  // inside your component:
  const sheetY = useSharedValue(0); // 0 means fully visible
  const maxDrag = 250; // how much it can go down

  // const initialRegion = {
  //   latitude: 28.694,
  //   longitude: -81.564,
  //   latitudeDelta: 0.01,
  //   longitudeDelta: 0.01
  // };
  const initialRegion = yard.initialRegion;

  const gestureHandler = useAnimatedGestureHandler({
    onStart: (_, ctx) => {
      ctx.startY = sheetY.value;
    },
    onActive: (event, ctx) => {
      sheetY.value = Math.min(Math.max(ctx.startY + event.translationY, 0), maxDrag);
    },
    onEnd: () => {
      // snap to top if less than half dragged
      if (sheetY.value < maxDrag / 2) {
        sheetY.value = withSpring(0);
      } else {
        sheetY.value = withSpring(maxDrag);
      }
    }
  });

  const animatedSheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetY.value }]
  }));

  // Build graph once
  // useEffect(() => {
  //   buildGraph(roadData);
  // }, []);

  useEffect(() => {
    // reset graph for new yard
    graph.current = {};
    nodeList.current = {};
    buildGraph(roadData);
  }, [roadData]);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      let loc = await Location.getCurrentPositionAsync({});
      setLocation(loc.coords);
    })();
  }, []);

  const centerOnUser = () => {
    if (location && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      });
    }
  };

  // const slotOptions = useMemo(() => {
  //   return Array.from(new Set(slotData.features.map(f => f.properties?.Slot_Id)))
  //     .map(slot => ({ label: slot, value: slot }));
  // }, []);
  const slotOptions = useMemo(() => {
    return Array.from(new Set(slotData.features.map(f => f.properties?.Slot_Id)))
      .map(slot => ({ label: slot, value: slot }));
  }, [slotData]);

  const getLotOptions = (slotId) => {
    if (!slotId) return [];
    return slotData.features
      .filter(f => f.properties?.Slot_Id === slotId)
      .map(f => ({
        label: f.properties?.lot_id,
        value: f.properties?.lot_id
      }));
  };

  function buildGraph(data) {
    const coordStr = (c) => c.join(",");

    const processLine = (coords) => {
      for (let i = 0; i < coords.length - 1; i++) {
        const start = coords[i];
        const end = coords[i + 1];
        const line = turf.lineString([start, end]);

        const length = turf.length(line, { units: "kilometers" });
        const interval = 0.005; // same as Yard 1
        const steps = Math.ceil(length / interval);

        let segmentPoints = [];
        for (let j = 0; j <= steps; j++) {
          const pt = turf.along(line, j * interval, { units: "kilometers" }).geometry.coordinates;
          segmentPoints.push([pt[1], pt[0]]); // lat, lng
        }

        for (let k = 0; k < segmentPoints.length - 1; k++) {
          const a = segmentPoints[k];
          const b = segmentPoints[k + 1];
          const aKey = coordStr(a);
          const bKey = coordStr(b);
          const dist = haversine(a, b);

          if (!graph.current[aKey]) graph.current[aKey] = {};
          if (!graph.current[bKey]) graph.current[bKey] = {};
          graph.current[aKey][bKey] = dist;
          graph.current[bKey][aKey] = dist;
          nodeList.current[aKey] = a;
          nodeList.current[bKey] = b;
        }
      }
    };

    data.features.forEach((f) => {
      const geometry = f.geometry;
      if (!geometry || !geometry.coordinates) return;

      if (geometry.type === "LineString") {
        processLine(geometry.coordinates);
      } else if (geometry.type === "MultiLineString") {
        geometry.coordinates.forEach(line => processLine(line));
      } else {
        console.warn("Unsupported geometry type:", geometry.type);
      }
    });
  }

  function haversine(a, b) {
    const R = 6371e3;
    const toRad = (x) => x * Math.PI / 180;
    const dLat = toRad(b[0] - a[0]), dLon = toRad(b[1] - a[1]);
    const lat1 = toRad(a[0]), lat2 = toRad(b[0]);
    const aCalc = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(aCalc), Math.sqrt(1 - aCalc));
  }

  function dijkstra(startKey, endKey) {
    const dist = {}, prev = {}, visited = new Set();
    for (const key in graph.current) dist[key] = Infinity;
    dist[startKey] = 0;
    while (true) {
      let minNode = null;
      for (const key in dist) {
        if (!visited.has(key) && (minNode === null || dist[key] < dist[minNode])) minNode = key;
      }
      if (!minNode || minNode === endKey) break;
      visited.add(minNode);
      for (const neighbor in graph.current[minNode]) {
        const alt = dist[minNode] + graph.current[minNode][neighbor];
        if (alt < dist[neighbor]) {
          dist[neighbor] = alt;
          prev[neighbor] = minNode;
        }
      }
    }
    const path = [];
    let u = endKey;
    while (u) {
      path.unshift(u);
      u = prev[u];
    }
    return path;
  }

  // Find nearest graph node
  function findNearest(coord) {
    let nearest = null, minDist = Infinity;
    for (const key in nodeList.current) {
      const dist = haversine(coord, nodeList.current[key]);
      if (dist < minDist) {
        minDist = dist;
        nearest = key;
      }
    }
    return nearest;
  }

  function getCoordsFromLot(lotId) {
    const feature = slotData.features.find(
      f => f.properties?.lot_id?.toString().trim() === lotId.toString().trim()
    );

    if (!feature) {
      console.warn(`❌ Lot ${lotId} not found in slotData`);
      console.log("Available lot_ids:", slotData.features.map(f => f.properties?.lot_id));
      return null;
    }

    let lat, lng;
    if (feature.geometry.type === "Point") {
      [lng, lat] = feature.geometry.coordinates;
    } else if (feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon") {
      const centroid = turf.centroid(feature);
      [lng, lat] = centroid.geometry.coordinates;
    } else {
      console.warn(`Unsupported geometry type: ${feature.geometry.type}`);
      return null;
    }

    console.log([lat, lng])
    // 🔑 Snap this lot centroid to nearest road node
    const nearestKey = findNearest([lat, lng]);
    if (!nearestKey) {
      console.warn(`⚠️ Could not snap lot ${lotId} to road`);
      return null;
    }

    console.log(`✅ Lot ${lotId} snapped to`, nodeList.current[nearestKey]);
    return nodeList.current[nearestKey];
  }


  // Called when Get Directions button clicked
  function handleGetDirections() {
    if (!pickupLot || !dropLot) {
      alert("Select both pickup and drop");
      return;
    }

    const pickupCoords = getCoordsFromLot(pickupLot);
    const dropCoords = getCoordsFromLot(dropLot);

    const startKey = findNearest(pickupCoords) || null;
    const endKey = findNearest(dropCoords) || null;
    const pathKeys = dijkstra(startKey, endKey);
    const coordsPath = pathKeys.map(k => ({
      latitude: nodeList.current[k][0],
      longitude: nodeList.current[k][1]
    }));

    console.log("Pickup lot:", pickupLot, "coords:", pickupCoords);
    console.log("Drop lot:", dropLot, "coords:", dropCoords);
    console.log("StartKey:", startKey, "EndKey:", endKey);
    console.log("Path keys:", pathKeys.length);

    // ✅ Calculate total distance & ETA
    let totalMeters = 0;
    for (let i = 0; i < coordsPath.length - 1; i++) {
      const a = [coordsPath[i].latitude, coordsPath[i].longitude];
      const b = [coordsPath[i + 1].latitude, coordsPath[i + 1].longitude];
      totalMeters += haversine(a, b); // existing haversine returns meters
    }

    const etaMinutes = Math.max(1, Math.round(totalMeters / 1.4 / 60)); // walking speed ~1.4 m/s
    setDistance(formatDistance(totalMeters));     // <-- use helper for nicer display
    setEta(`${etaMinutes} min`);
    setShowRouteInfo(true); // show bottom modal


    setRouteCoords(coordsPath);
    if (coordsPath.length >= 2 && mapRef.current) {
      mapRef.current.fitToCoordinates(coordsPath, {
        edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
        animated: true,
      });
    }

    // ✅ Build turn-by-turn steps (NEW)
    const builtSteps = buildInstructions(coordsPath);
    setSteps(builtSteps);

    setShowDirections(false); // hide pickup/drop modal
  }

  function formatDistance(m) {
    return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
  }

  function bearing(from, to) {
    // from/to are [lat, lng]
    const toRad = x => x * Math.PI / 180;
    const lat1 = toRad(from[0]);
    const lat2 = toRad(to[0]);
    const dLon = toRad(to[1] - from[1]);
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    const deg = Math.atan2(y, x) * 180 / Math.PI;
    return (deg + 360) % 360;
  }

  function deltaAngle(a, b) {
    // smallest signed difference -180..180
    return ((b - a + 540) % 360) - 180;
  }

  function compassDir(brg) {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'N'];
    return dirs[Math.round(brg / 45)];
  }

  /**
   * Build a simple list of instructions from polyline coords
   * routeCoords: [{ latitude, longitude }, ...]
   */
  function buildInstructions(routeCoords) {
    const pts = routeCoords.map(p => [p.latitude, p.longitude]); // [lat,lng]
    if (pts.length < 2) return [];

    // segment bearings + distances
    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      segs.push({
        dist: haversine(a, b),     // you already have haversine (meters)
        brg: bearing(a, b),
      });
    }

    const out = [];
    // Start
    out.push({ type: 'start', text: `Head ${compassDir(segs[0].brg)}`, distance: 0 });

    let accDist = segs[0].dist;
    let prevBrg = segs[0].brg;

    for (let i = 1; i < segs.length; i++) {
      const d = deltaAngle(prevBrg, segs[i].brg);
      const ad = Math.abs(d);

      // keep straight if tiny direction change
      if (ad < 15) {
        accDist += segs[i].dist;
        prevBrg = segs[i].brg;
        continue;
      }

      // close the straight chunk
      if (accDist > 0) {
        out.push({ type: 'straight', text: 'Continue straight', distance: accDist });
      }

      // turn
      let text;
      if (ad >= 135) text = 'Make a U-turn';
      else if (ad >= 45) text = d > 0 ? 'Turn right' : 'Turn left';
      else text = d > 0 ? 'Slight right' : 'Slight left';

      out.push({ type: 'turn', text, distance: 0 });

      // start new straight accumulation
      accDist = segs[i].dist;
      prevBrg = segs[i].brg;
    }

    // finalize last straight
    if (accDist > 0) out.push({ type: 'straight', text: 'Continue straight', distance: accDist });

    // arrive
    out.push({ type: 'arrive', text: 'You have arrived', distance: 0 });

    return out;
  }

  function iconForStep(step) {
    if (step.type === 'arrive') return { name: 'flag-checkered', color: '#0a7', lib: 'FontAwesome5' };
    if (step.type === 'start') return { name: 'play', color: '#007AFF', lib: 'FontAwesome5' };
    if (step.type === 'turn') {
      if (step.text.includes('left')) return { name: 'arrow-left', color: '#007AFF', lib: 'FontAwesome5' };
      if (step.text.includes('right')) return { name: 'arrow-right', color: '#007AFF', lib: 'FontAwesome5' };
      return { name: 'undo', color: '#f33', lib: 'FontAwesome5' }; // U-turn fallback
    }
    // straight/slight
    return { name: 'arrow-up', color: '#444', lib: 'FontAwesome5' };
  }

  // 🔊 speak helper
  function speak(text) {
    Speech.speak(text, { language: "en-US" });
  }

  // Start Navigation
  async function startNavigation() {
    let loc = await Location.getCurrentPositionAsync({});
    const userCoords = [loc.coords.latitude, loc.coords.longitude];

    // snap user position
    const startKey = findNearest(userCoords);
    const endKey = findNearest(getCoordsFromLot(dropLot));

    if (!startKey || !endKey) {
      alert("Unable to start navigation, road network missing nearby.");
      return;
    }

    const pathKeys = dijkstra(startKey, endKey);
    const coordsPath = pathKeys.map(k => ({
      latitude: nodeList.current[k][0],
      longitude: nodeList.current[k][1],
    }));

    setRouteCoords(coordsPath);

    if (coordsPath.length >= 2 && mapRef.current) {
      mapRef.current.fitToCoordinates(coordsPath, {
        edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
        animated: true,
      });
    }

    // set active nav
    setNavActive(true);

    // Rebuild turn-by-turn steps for this new route
    const builtSteps = buildInstructions(coordsPath);
    setSteps(builtSteps);

    // Optionally announce first instruction
    if (builtSteps.length) {
      speakInstruction(builtSteps[0].text);
    }
  }


  function speakInstruction(text) {
    Speech.speak(text, { language: "en", pitch: 1, rate: 1 });
  }

  // Stop Navigation
  function stopNavigation() {
    setNavActive(false);
    if (watcherRef.current) {
      watcherRef.current.remove();
      watcherRef.current = null;
    }
    speak("Navigation ended");
  }

  // match user location to route
  function handleUserProgress(userCoord) {
    if (!routeCoords.length || !steps.length) return;

    // find closest step point
    let nearestStepIdx = activeStepIndex;
    let minDist = Infinity;

    for (let i = activeStepIndex; i < steps.length; i++) {
      const step = steps[i];
      // only check steps with distance
      if (step.distance > 0) {
        const stepPoint = [routeCoords[i].latitude, routeCoords[i].longitude];
        const d = haversine(userCoord, stepPoint);
        if (d < minDist) {
          minDist = d;
          nearestStepIdx = i;
        }
      }
    }

    if (nearestStepIdx !== activeStepIndex) {
      setActiveStepIndex(nearestStepIdx);

      const step = steps[nearestStepIdx];
      if (step.type === "turn") {
        speak(step.text);
      } else if (step.type === "arrive") {
        speak("You have arrived at your destination");
        stopNavigation();
      }
    }
  }


  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.container}>
        <MapView
          ref={mapRef}
          style={styles.map}
          showsUserLocation
          mapType="mutedStandard"
          initialRegion={initialRegion}
          scrollEnabled={!showDirections}
          zoomEnabled={!showDirections}
          pitchEnabled={!showDirections}
          rotateEnabled={!showDirections}
        >
          <Geojson
            geojson={roadData}
            strokeColor="red"
            fillColor="rgba(255,0,0,0.2)"
            strokeWidth={2}
          />
          {/* Route Polyline */}
          {routeCoords.length >= 2 && (
            <>
              <Polyline
                coordinates={routeCoords}
                strokeColor="blue"
                strokeWidth={4}
              />

              {/* Start marker: small white circle */}
              <Marker coordinate={routeCoords[0]} anchor={{ x: 0.5, y: 0.5 }}>
                <View
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    backgroundColor: 'white',
                    borderWidth: 2,
                    borderColor: 'black'
                  }}
                />
              </Marker>

              {/* Destination marker: red location pin */}
              <Marker coordinate={routeCoords[routeCoords.length - 1]} anchor={{ x: 0.5, y: 1 }}>
                <FontAwesome5 name="map-marker-alt" size={32} color="red" />
              </Marker>
            </>
          )}
        </MapView>

        {showRouteInfo && (
          <GestureHandlerRootView>
            <PanGestureHandler onGestureEvent={gestureHandler}>
              <Animated.View style={[styles.routeInfoContent, animatedSheetStyle]}>
                {/* drag indicator */}
                <View style={{
                  alignSelf: 'center',
                  width: 40,
                  height: 5,
                  borderRadius: 3,
                  backgroundColor: '#ccc',
                  marginBottom: 8
                }} />

                {/* Close button */}
                <TouchableOpacity
                  style={styles.routeCloseBtn}
                  onPress={() => {
                    setShowRouteInfo(false);
                    setNavActive(false);
                    setRouteCoords([]);
                    setSteps([]);
                  }}
                >
                  <Ionicons name="close" size={20} color="#000" />
                </TouchableOpacity>

                {/* Start/Stop Button inside panel */}
                {!navActive ? (
                  <TouchableOpacity style={styles.startSmallBtn} onPress={startNavigation}>
                    <FontAwesome5 name="play" size={14} color="white" />
                    <Text style={styles.btnText}>Start</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={[styles.startSmallBtn, { backgroundColor: "red" }]} onPress={stopNavigation}>
                    <FontAwesome5 name="stop" size={14} color="white" />
                    <Text style={styles.btnText}>Stop</Text>
                  </TouchableOpacity>
                )}

                {/* Distance & ETA */}
                <View style={{ marginTop: 5 }}>
                  <Text style={styles.routeInfoText}>Distance: {distance}</Text>
                  <Text style={styles.routeInfoText}>ETA: {eta}</Text>
                </View>

                {/* Step-by-step list */}
                {!!steps.length && (
                  <View style={styles.directionsList}>
                    {steps.map((s, idx) => {
                      const icon = iconForStep(s);
                      return (
                        <View key={idx} style={styles.directionRow}>
                          {icon.lib === 'FontAwesome5' ? (
                            <FontAwesome5 name={icon.name} size={16} color={icon.color} style={{ marginRight: 6 }} />
                          ) : (
                            <Ionicons name={icon.name} size={16} color={icon.color} style={{ marginRight: 6 }} />
                          )}
                          <Text style={styles.directionItem}>
                            {s.text}{s.distance > 0 ? ` for ${formatDistance(s.distance)}` : ''}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </Animated.View>
            </PanGestureHandler>
          </GestureHandlerRootView>
        )}

        <SafeAreaView style={styles.searchContainer}>
          <TextInput
            style={styles.searchBar}
            placeholder='Search here'
            placeholderTextColor="#888"
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={Keyboard.dismiss}
          />
        </SafeAreaView>

        <TouchableOpacity
          style={styles.homeButton}
          onPress={() => {
            if (mapRef.current) {
              mapRef.current.animateToRegion(initialRegion, 1000); // 1000ms animation
            }
          }}
        >
          {/* <Ionicons name="home" size={24} color="black" /> */}
          <Text style={{ color: 'black', fontSize: 14, paddingHorizontal: 4, paddingVertical: 2, fontWeight: 'semi-bold' }} >Home</Text>
        </TouchableOpacity>


        <TouchableOpacity style={styles.directionsButton} onPress={() => setShowDirections(true)}>
          <Ionicons name="navigate" size={24} color="white" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.locButton} onPress={centerOnUser}>
          <Ionicons name="locate" size={24} color="black" />
        </TouchableOpacity>

        <Modal visible={showDirections} animationType="slide" transparent>
          <View style={styles.modalContainer}>
            <SafeAreaView style={{ backgroundColor: 'white' }} />

            <View style={styles.modalContent}>
              <Text style={styles.label}>Pickup Location</Text>

              <DropDownPicker
                open={pickupSlotOpen}
                value={pickupSlot}
                items={slotOptions}
                setOpen={setPickupSlotOpen}
                setValue={setPickupSlot}
                placeholder="Select Slot"
                style={styles.dropdown}
                zIndex={4000}
                zIndexInverse={1000}
                onChangeValue={() => setPickupLot(null)}
              />

              <DropDownPicker
                open={pickupLotOpen}
                value={pickupLot}
                items={getLotOptions(pickupSlot)}
                setOpen={setPickupLotOpen}
                setValue={setPickupLot}
                placeholder="Select Lot"
                style={styles.dropdown}
                zIndex={3000}
                zIndexInverse={2000}
                disabled={!pickupSlot}
              />

              <TouchableOpacity
                style={styles.swapButton}
                onPress={() => {
                  const tempSlot = pickupSlot;
                  const tempLot = pickupLot;
                  setPickupSlot(dropSlot);
                  setPickupLot(dropLot);
                  setDropSlot(tempSlot);
                  setDropLot(tempLot);
                }}
              >
                <Ionicons name="swap-vertical" size={24} color="#007AFF" />
              </TouchableOpacity>

              <Text style={styles.label}>Drop Location</Text>

              <DropDownPicker
                open={dropSlotOpen}
                value={dropSlot}
                items={slotOptions}
                setOpen={setDropSlotOpen}
                setValue={setDropSlot}
                placeholder="Select Slot"
                style={styles.dropdown}
                zIndex={2000}
                zIndexInverse={3000}
                onChangeValue={() => setDropLot(null)}
              />

              <DropDownPicker
                open={dropLotOpen}
                value={dropLot}
                items={getLotOptions(dropSlot)}
                setOpen={setDropLotOpen}
                setValue={setDropLot}
                placeholder="Select Lot"
                style={styles.dropdown}
                zIndex={1000}
                zIndexInverse={4000}
                disabled={!dropSlot}
              />

              <TouchableOpacity style={styles.closeButton} onPress={handleGetDirections}>
                <Text style={{ color: 'white' }}>Get Directions</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.closeButton} onPress={() => setShowDirections(false)}>
                <Text style={{ color: 'white' }}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { width: '100%', height: '100%' },
  searchContainer: {
    position: 'absolute',
    top: 30,
    left: 10,
    right: 10,
    zIndex: 1,
  },
  searchBar: {
    height: 48,
    backgroundColor: '#fff',
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 26,
    paddingHorizontal: 12,
    fontSize: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  homeButton: {
    position: 'absolute',
    top: 100, // just below search bar (adjust as needed)
    left: 20,
    backgroundColor: '#fff',
    padding: 5,
    borderRadius: 50,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    zIndex: 10,
    marginTop: 5,
  },
  locButton: {
    position: 'absolute',
    bottom: 100,
    right: 20,
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 50,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  directionsButton: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 30,
    elevation: 5
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-start',
  },
  modalContent: {
    backgroundColor: 'white',
    padding: 20
  },
  label: {
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 5
  },
  dropdown: {
    marginBottom: 15
  },
  closeButton: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 6,
    marginTop: 20,
    alignItems: 'center'
  },
  swapButton: {
    alignSelf: 'center',
    marginVertical: 10
  },
  routeInfoContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    padding: 20,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 6,
    zIndex: 999
  },
  routeInfoText: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4
  },
  routeCloseBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    padding: 4
  },
  directionsList: {
    marginTop: 10
  },
  directionItem: {
    fontSize: 15,
    paddingVertical: 2,
    color: '#333'
  },
  directionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4
  },
  startSmallBtn: {
    alignSelf: "flex-start",   // left aligned
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "green",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginBottom: 10
  },
  btnText: {
    color: "white",
    marginLeft: 6,
    fontSize: 14,
    fontWeight: "600"
  }
});
