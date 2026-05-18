import {
  createSystem,
  PanelUI,
  PanelDocument,
  eq,
  UIKitDocument,
  UIKit,
} from "@iwsdk/core";

import {
  onStats,
  onStatus,
  connectFTMS,
  disconnectFTMS,
  startSimulation,
  hasBluetooth,
  getStatus,
} from "./ftms.js";

const GAUGE_FULL_WIDTH = 55;
const MAX_RPM = 120;

export class CycleSystem extends createSystem({
  statsPanel: {
    required: [PanelUI, PanelDocument],
    where: [eq(PanelUI, "config", "./ui/stats.json")],
  },
}) {
  private panelBound = false;

  init() {
    this.queries.statsPanel.subscribe("qualify", (entity) => {
      if (this.panelBound) return;
      const doc = PanelDocument.data.document[entity.index] as UIKitDocument;
      if (!doc) return;
      this.panelBound = true;
      this.bindPanel(doc);
    });
  }

  private bindPanel(doc: UIKitDocument): void {
    const el = (id: string) => doc.getElementById(id) as UIKit.Text;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const set = (id: string, props: Record<string, unknown>) => (doc.getElementById(id) as any).setProperties(props);

    // UIKit button click — works in VR via ray interaction
    el("connect-btn").addEventListener("click", () => {
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

    this.cleanupFuncs.push(
      onStatus((status) => {
        const dot: Record<string, unknown> = { backgroundColor: "#52525b" };
        const btn: Record<string, unknown> = {
          text: hasBluetooth() ? "Connect" : "Simulate",
          backgroundColor: "#fafafa",
          color: "#09090b",
        };
        if (status === "connected") {
          dot.backgroundColor = "#22c55e";
          btn.text = "Disconnect";
          btn.backgroundColor = "#dc2626";
          btn.color = "#fafafa";
        } else if (status === "connecting") {
          dot.backgroundColor = "#f59e0b";
          btn.text = "Connecting…";
          btn.backgroundColor = "#71717a";
          btn.color = "#fafafa";
        }
        set("status-dot", dot);
        set("connect-btn", btn);
      }),

      onStats((stats) => {
        const rpm = Math.round(stats.cadence);
        const frac = Math.min(rpm / MAX_RPM, 1);
        const fillColor = frac > 0.75 ? "#ef4444" : frac > 0.5 ? "#f59e0b" : "#22c55e";

        set("rpm-fill", { width: frac * GAUGE_FULL_WIDTH, backgroundColor: fillColor });
        el("rpm-value").setProperties({ text: String(rpm) });
        el("stat-speed").setProperties({ text: stats.speed.toFixed(1) });
        el("stat-power").setProperties({ text: String(Math.round(stats.power)) });
        el("stat-distance").setProperties({ text: (stats.distance / 1000).toFixed(2) });
        el("stat-hr").setProperties({ text: stats.heartRate > 0 ? String(stats.heartRate) : "--" });

        const m = Math.floor(stats.elapsedTime / 60);
        const s = stats.elapsedTime % 60;
        el("stat-time").setProperties({ text: `${m}:${String(s).padStart(2, "0")}` });
      }),
    );
  }
}
