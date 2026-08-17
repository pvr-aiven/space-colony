import "./ui/styles.css";
import { SceneManager } from "./scene/SceneManager";
import { HomeBase } from "./scene/HomeBase";
import { Sites } from "./scene/Site";
import { Ships } from "./scene/Ship";
import { store } from "./state/gameState";
import { collectResources, getCatalog, getState, loadOrCreateSession } from "./api/client";
import { ResourceBar } from "./ui/ResourceBar";
import { BuildMenu } from "./ui/BuildMenu";
import { ShipPanel } from "./ui/ShipPanel";
import { MissionLog } from "./ui/MissionLog";

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

const resourceBar = new ResourceBar();
const buildMenu = new BuildMenu(showToast);
const shipPanel = new ShipPanel(showToast);
const missionLog = new MissionLog();
hud.append(resourceBar.el, buildMenu.el, shipPanel.el, missionLog.el);

const sceneManager = new SceneManager(container);
const homeBase = new HomeBase();
const sites = new Sites();
const ships = new Ships(sites);
sceneManager.scene.add(homeBase.group, sites.group, ships.group);
sceneManager.onUpdate((dt) => {
  homeBase.update(dt);
  sites.update(dt);
  ships.update();
});
sceneManager.start();

// Passive production accrues server-side; a slow poll is enough to feel
// "live" without hammering the API (ship travel itself is client-interpolated).
const POLL_INTERVAL_MS = 20_000;

async function refresh(): Promise<void> {
  try {
    await collectResources();
    store.setState(await getState());
  } catch {
    // transient network hiccup — next poll will retry.
  }
}

async function bootstrap(): Promise<void> {
  const [state, catalog] = await Promise.all([loadOrCreateSession(), getCatalog()]);
  store.setCatalog(catalog);
  store.setState(state);
  setInterval(refresh, POLL_INTERVAL_MS);
}

bootstrap().catch((err) => {
  console.error("Failed to start game", err);
  showToast("Failed to connect to the backend");
});
