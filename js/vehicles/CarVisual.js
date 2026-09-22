import * as THREE from 'three';
import { cloneTint } from '../core/GltfUtils.js';
import { angDelta } from '../core/MathUtils.js';

export const CAR_SCALE = 1;

const WHEEL_AXIS = new THREE.Vector3(1, 0, 0);
const wheelQ = new THREE.Quaternion();

// Builds (or rebuilds) the 3D model + wheel rig for one physics car, mounted
// under `root`. Port of index.html:555-605 (buildCarVisual), unchanged except
// for taking `carAssets` as a parameter instead of closing over a module-level
// array loaded from base64.
export function buildCarVisual(root, assetIndex, tintColor, carAssets) {
  while (root.children.length) root.remove(root.children[0]);
  const model = cloneTint(carAssets[assetIndex], tintColor);
  model.scale.setScalar(CAR_SCALE);
  root.add(model);

  const nodes = [];
  model.traverse(n => {
    if (/wheel/i.test(n.name) && (n.isMesh || n.isGroup) && !(n.parent && /wheel/i.test(n.parent.name))) nodes.push(n);
  });
  const wheels = nodes.map(n => {
    const localZ = n.position.z, parent = n.parent, pivot = new THREE.Group();
    pivot.name = n.name + '_steerPivot';
    parent.add(pivot);
    pivot.position.copy(n.position);
    parent.remove(n);
    pivot.add(n);
    n.position.set(0, 0, 0);
    return { pivot, mesh: n, front: /front/i.test(n.name), localZ, baseQ: n.quaternion.clone(), spin: 0 };
  });
  if (wheels.length && !wheels.some(w => w.front)) {
    const byZ = [...wheels].sort((a, b) => b.localZ - a.localZ), frontTwo = new Set(byZ.slice(0, 2));
    wheels.forEach(w => { w.front = frontTwo.has(w); });
  }

  const savedPos = root.position.clone(), savedRot = root.rotation.clone();
  root.position.set(0, 0, 0); root.rotation.set(0, 0, 0); root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model), groundLift = -box.min.y + .02;
  root.position.copy(savedPos); root.rotation.copy(savedRot);

  // Headlight/taillight glow -- every car gets these (cheap unlit emissive
  // panes, not real dynamic lights, so this scales fine to the whole traffic
  // pool). +Z is the front of the car (matches the wheel front-detection
  // convention above and updatePlayer/driveAI's forward-motion convention).
  const lampW = (box.max.x - box.min.x) * .13, lampH = lampW * .5;
  // .3 measured too low in practice -- landed near the wheel/bumper edge
  // instead of the rear fascia. .52 sits mid-body, roughly where a real
  // light cluster is.
  const lampY = box.min.y + (box.max.y - box.min.y) * .52;
  const lampX = (box.max.x - box.min.x) * .3;
  const headlightMat = new THREE.MeshBasicMaterial({ color: 0xfff6d8 });
  const taillightMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  for (const xSign of [-1, 1]) {
    const headlight = new THREE.Mesh(new THREE.BoxGeometry(lampW, lampH, .06), headlightMat);
    headlight.position.set(xSign * lampX, lampY, box.max.z - .05);
    root.add(headlight);
    const taillight = new THREE.Mesh(new THREE.BoxGeometry(lampW, lampH, .06), taillightMat);
    taillight.position.set(xSign * lampX, lampY, box.min.z + .05);
    root.add(taillight);
  }

  let sirenLights = null;
  if (assetIndex === 2 || assetIndex === 16) {
    const barW = (box.max.x - box.min.x) * .55, barY = box.max.y + .08, barZ = (box.min.z + box.max.z) / 2 - (box.max.z - box.min.z) * .12;
    const redMat = new THREE.MeshBasicMaterial({ color: 0xff2020 }), blueMat = new THREE.MeshBasicMaterial({ color: 0x2050ff });
    const red = new THREE.Mesh(new THREE.BoxGeometry(barW * .45, .12, .22), redMat); red.position.set(-barW * .26, barY, barZ);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(barW * .45, .12, .22), blueMat); blue.position.set(barW * .26, barY, barZ);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(barW, .06, .26), new THREE.MeshStandardMaterial({ color: 0x111111 })); housing.position.set(0, barY - .05, barZ);
    root.add(housing, red, blue);
    const redLight = new THREE.PointLight(0xff2020, 0, 10, 2); redLight.position.copy(red.position);
    const blueLight = new THREE.PointLight(0x2050ff, 0, 10, 2); blueLight.position.copy(blue.position);
    root.add(redLight, blueLight);
    sirenLights = { redMat, blueMat, redLight, blueLight };
  }

  return { model, wheels, groundLift, sirenLights, box };
}

// Flags a car to flash briefly -- the visual indicator for "this is the car
// that just got hit," since a HUD number going down doesn't say WHICH car
// was involved when there might be several nearby. Caches each mesh
// material's original emissive once per car (materials are per-car
// instances already, via cloneTint, so this never bleeds into other cars)
// and drives the flash from placeCarVisual each frame -- no extra per-frame
// work for cars that were never hit.
export function triggerHitFlash(car, color = 0xff3b3b, duration = .28) {
  if (!car._hitFlashMats) {
    car._hitFlashMats = [];
    car.model.traverse(o => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (m.emissive) car._hitFlashMats.push({ mat: m, origEmissive: m.emissive.clone(), origIntensity: m.emissiveIntensity ?? 0 });
      }
    });
  }
  car._hitFlashColor = car._hitFlashColor || new THREE.Color();
  car._hitFlashColor.set(color);
  car._hitFlashDuration = duration;
  car._hitFlashTimer = duration;
}

// Places a car's 3D root from its physics state each frame: position, body
// roll/pitch smoothing, wheel spin/steer, and (for police models) siren
// flashing. Port of index.html:620-633 (placeCar). `car` needs: root, wheels,
// groundLift, position, heading, moveHeading, steer, speed, sirenLights, and
// a mutable `rollVisual` field (created here on first use).
export function placeCarVisual(car, dt, raceTime) {
  const driftAngle = angDelta(car.moveHeading, car.heading);
  car.root.position.set(car.position.x, car.position.y + car.groundLift, car.position.z);
  car.root.rotation.order = 'YXZ';
  car.root.rotation.y = car.heading;

  if (car.rollVisual === undefined) car.rollVisual = 0;
  const targetRoll = THREE.MathUtils.clamp(-car.steer * .06 - driftAngle * .16, -.35, .35);
  car.rollVisual = THREE.MathUtils.lerp(car.rollVisual, targetRoll, 1 - Math.exp(-dt * 10));
  car.root.rotation.z = car.rollVisual;

  for (const w of car.wheels) {
    w.spin -= car.speed * dt / .47;
    w.mesh.quaternion.copy(w.baseQ).multiply(wheelQ.setFromAxisAngle(WHEEL_AXIS, w.spin));
    w.pivot.rotation.y = w.front ? car.steer * .52 : 0;
  }

  if (car.sirenLights) {
    const on = Math.floor(raceTime * 6) % 2 === 0;
    const { redMat, blueMat, redLight, blueLight } = car.sirenLights;
    redMat.color.setHex(on ? 0xff2020 : 0x330000);
    blueMat.color.setHex(on ? 0x111133 : 0x2050ff);
    redLight.intensity = on ? 3 : 0;
    blueLight.intensity = on ? 0 : 3;
  }

  if (car._hitFlashTimer > 0) {
    car._hitFlashTimer = Math.max(0, car._hitFlashTimer - dt);
    const t = car._hitFlashTimer / car._hitFlashDuration; // 1 (just hit) -> 0 (fully faded)
    for (const { mat, origEmissive, origIntensity } of car._hitFlashMats) {
      mat.emissive.copy(origEmissive).lerp(car._hitFlashColor, t);
      mat.emissiveIntensity = origIntensity + (1 - origIntensity) * t;
    }
  }
}
