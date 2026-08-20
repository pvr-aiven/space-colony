import "./ui/styles.css";
import { SceneManager } from "./scene/SceneManager";
import { HomeBase } from "./scene/HomeBase";
import { Sites } from "./scene/Site";
import { Ships } from "./scene/Ship";
import { preloadShipModels } from "./scene/ShipModels";
import { SolarSystem } from "./scene/SolarSystem";
import { store } from "./state/gameState";
import { connectionStatus } from "./state/connection";
import { collectResources, getCatalog, getState, loadOrCreateSession } from "./api/client";
import { ResourceBar } from "./ui/ResourceBar";
import { BasePanel } from "./ui/BasePanel";
import { BuildMenu } from "./ui/BuildMenu";
import { ShipPanel } from "./ui/ShipPanel";
import { MissionLog } from "./ui/MissionLog";
import { ConnectionBanner } from "./ui/ConnectionBanner";

const container = document.getElementById("app")!;

const hud = document.createElement("div");
hud.className = "hud";
container.appendChild(hud);

function showToast(message: string): void {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  hud.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

const connectionBanner = new ConnectionBanner();
const resourceBar = new ResourceBar();
// The callback is deferred, so referencing sceneManager (declared below) is
// safe — it only runs once the button is actually clicked.
const basePanel = new BasePanel(showToast, () => sceneManager.recenterOnHome());
const buildMenu = new BuildMenu(showToast);
const shipPanel = new ShipPanel(showToast);
const missionLog = new MissionLog();

// Both right-hand panels share one flex column so they lay out in flow and
// can never overlap each other, whatever their content height.
const sideColumn = document.createElement("div");
sideColumn.className = "side-column";
sideColumn.append(buildMenu.el, shipPanel.el);

hud.append(connectionBanner.el, resourceBar.el, basePanel.el, sideColumn, missionLog.el);

const sceneManager = new SceneManager(container);
const homeBase = new HomeBase();
const sites = new Sites();
const ships = new Ships(sites);
const solarSystem = new SolarSystem();
sceneManager.scene.add(homeBase.group, sites.group, ships.group, solarSystem.group);
sceneManager.onUpdate((dt) => {
  homeBase.update(dt);
  sites.update(dt);
  ships.update(dt, sceneManager.camera);
  solarSystem.update(dt);
});
sceneManager.start();

// Passive production accrues server-side; a short poll keeps the resource
// counters visibly ticking up during a live demo (ship travel itself is
// client-interpolated, so this isn't about animation smoothness).
const POLL_INTERVAL_MS = 6_000;
const BOOTSTRAP_RETRY_MS = 4_000;

async function refresh(): Promise<void> {
  try {
    await collectResources();
    store.setState(await getState());
    connectionStatus.setOnline(true);
  } catch {
    // Surfaced via the connection banner — next poll retries on its own.
    connectionStatus.setOnline(false);
  }
}

// Retries indefinitely rather than failing once: if the backend isn't up
// yet (or Aiven Runtime is mid-deploy), the game should recover on its own
// once it becomes reachable, with the banner as the only visible symptom.
async function bootstrap(): Promise<void> {
  // Ship models are loaded before the first store.setState so that Ships can
  // build real meshes on its very first sync instead of briefly showing the
  // fallback primitives. preloadShipModels never rejects, so a model that
  // fails to load costs the fallback, not the bootstrap.
  while (true) {
    try {
      const [state, catalog] = await Promise.all([
        loadOrCreateSession(),
        getCatalog(),
        preloadShipModels(),
      ]);
      store.setCatalog(catalog);
      store.setState(state);
      connectionStatus.setOnline(true);
      setInterval(refresh, POLL_INTERVAL_MS);
      return;
    } catch (err) {
      connectionStatus.setOnline(false);
      console.error("Failed to reach the backend, retrying...", err);
      await new Promise((resolve) => setTimeout(resolve, BOOTSTRAP_RETRY_MS));
    }
  }
}

bootstrap();
