// Put each yard's files under: assets/data/<yardKey>/road.geojson + total.geojson
// Also set a center for initialRegion.

export const YARDS = {
  yard1: {
    key: "yard1",
    name: "Yard 1",
    initialRegion: {
      latitude: 28.694,
      longitude: -81.564,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    },
    roadData: require("../assets/data/yard1/road2.0.json"),
    slotData: require("../assets/data/yard1/total.json"),
  },
  yard2: {
    key: "yard2",
    name: "Yard 2",
    initialRegion: {
      latitude: 13.002705,
      longitude: 77.569867,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    },
    roadData: require("../assets/data/yard2/road_ma_updated.json"),
    slotData: require("../assets/data/yard2/total_ma.json"),
  },
  // add more yards here...
};

export function getYardOrDefault(key) {
  return YARDS[key] || YARDS.yard1;
}

export const YARD_LIST = Object.values(YARDS);
