import {
  World,
  SessionMode,
  PanelUI,
  Interactable,
  ScreenSpace,
  VisibilityState,
} from "@iwsdk/core";

import { CycleSystem } from "./CycleSystem.js";
import {
  onStatus,
  connectFTMS,
  disconnectFTMS,
  startSimulation,
  hasBluetooth,
  getStatus,
} from "./ftms.js";

// Native HTML button — reliable browser clicks and proper user-gesture for Web Bluetooth
const bleBtn = document.getElementById("ble-btn") as HTMLButtonElement;
const bleControls = document.getElementById("ble-controls") as HTMLDivElement;

bleBtn.addEventListener("click", () => {
  if (getStatus() === "connected") {
    disconnectFTMS();
  } else if (getStatus() === "disconnected") {
    if (hasBluetooth()) {
      connectFTMS().catch(console.error);
    } else {
      startSimulation();
    }
  }
});

onStatus((status) => {
  if (status === "connected") {
    bleBtn.textContent = "Disconnect";
    bleBtn.style.background = "#dc2626";
    bleBtn.style.color = "#fafafa";
  } else if (status === "connecting") {
    bleBtn.textContent = "Connecting...";
    bleBtn.style.background = "#71717a";
    bleBtn.style.color = "#fafafa";
  } else {
    bleBtn.textContent = hasBluetooth() ? "Connect" : "Simulate";
    bleBtn.style.background = "#fafafa";
    bleBtn.style.color = "#09090b";
  }
});

World.create(document.getElementById("scene-container") as HTMLDivElement, {
  xr: {
    sessionMode: SessionMode.ImmersiveVR,
    offer: "always",
    features: { handTracking: true, layers: true },
  },
  features: {
    locomotion: false,
    grabbing: false,
    physics: false,
    sceneUnderstanding: false,
    environmentRaycast: false,
    spatialUI: { forwardHtmlEvents: true },
  },
}).then((world) => {
  // Hide the native button in VR (UIKit panel button handles it there)
  world.visibilityState.subscribe((state) => {
    bleControls.style.display =
      state === VisibilityState.NonImmersive ? "" : "none";
  });

  const statsPanel = world
    .createTransformEntity()
    .addComponent(PanelUI, {
      config: "/ui/stats.json",
      maxWidth: 0.55,
      maxHeight: 0.9,
    })
    .addComponent(Interactable)
    .addComponent(ScreenSpace, {
      top: "10px",
      left: "10px",
      height: "95vh",
    });

  statsPanel.object3D!.position.set(0, 1.4, -1.5);

  world.registerSystem(CycleSystem);
});
