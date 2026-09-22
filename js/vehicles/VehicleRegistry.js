// Verbatim port of index.html:492-523.

export const mphToMs = mph => mph / 2.23694;

export const VEHICLES = [
  { assetIndex: 0, name: 'Apex GT', tag: 'Balanced sports coupe', speed: 4, accel: 4, handling: 3, topMph: 165 },
  { assetIndex: 1, name: 'Velocity S2', tag: 'Lightweight sports car', speed: 5, accel: 5, handling: 2, topMph: 180 },
  { assetIndex: 2, name: 'Interceptor', tag: 'Police-tuned pursuit', speed: 4, accel: 3, handling: 4, topMph: 150 },
  { assetIndex: 3, name: 'City Cab', tag: 'Taxi', speed: 2, accel: 2, handling: 5, topMph: 120 },
  { assetIndex: 4, name: 'Trailblazer', tag: 'SUV', speed: 2, accel: 2, handling: 3, topMph: 130 },
  { assetIndex: 5, name: 'Commuter', tag: 'Compact', speed: 3, accel: 3, handling: 4, topMph: 115 },
  { assetIndex: 6, name: 'Sedan LX', tag: 'Sedan', speed: 3, accel: 3, handling: 3, topMph: 130 },
  { assetIndex: 7, name: 'Nemesis GT', tag: 'Hypercar', speed: 5, accel: 5, handling: 2, topMph: 220 },
  { assetIndex: 8, name: 'Scarlet GT', tag: 'Supercar', speed: 5, accel: 4, handling: 3, topMph: 205 },
  { assetIndex: 9, name: 'Super V12', tag: 'Supercar', speed: 5, accel: 5, handling: 2, topMph: 210 },
  { assetIndex: 10, name: 'Onyx Supercar', tag: 'Supercar', speed: 4, accel: 4, handling: 3, topMph: 195 },
  { assetIndex: 11, name: 'Street Coupe', tag: 'Sports coupe', speed: 3, accel: 3, handling: 4, topMph: 160 },
  { assetIndex: 12, name: 'Muscle 6.2', tag: 'Muscle car', speed: 4, accel: 5, handling: 2, topMph: 170 },
  { assetIndex: 13, name: 'Rally Cross', tag: 'Rally car', speed: 4, accel: 4, handling: 5, topMph: 135 },
  { assetIndex: 14, name: 'Armor Unit', tag: 'Armored SUV', speed: 2, accel: 2, handling: 4, topMph: 110 },
  { assetIndex: 15, name: 'Trail Runner', tag: 'Off-roader', speed: 2, accel: 2, handling: 3, topMph: 105 },
  { assetIndex: 16, name: 'Police Cruiser', tag: 'Police-tuned pursuit', speed: 4, accel: 3, handling: 4, topMph: 150 },
  { assetIndex: 17, name: 'City Runner', tag: 'Compact', speed: 3, accel: 3, handling: 3, topMph: 115 },
  { assetIndex: 18, name: 'Cargo Van', tag: 'Van', speed: 2, accel: 2, handling: 3, topMph: 95 }
];

export function statMultipliers(v) {
  return {
    topMs: mphToMs(v.topMph),
    accelMult: .6 + (v.accel - 1) * .175,
    handlingMult: .6 + (v.handling - 1) * .1625
  };
}

export function vehicleByAssetIndex(assetIndex) {
  return VEHICLES.find(v => v.assetIndex === assetIndex);
}
