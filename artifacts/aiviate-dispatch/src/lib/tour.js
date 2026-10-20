// First-run walkthrough state. The tour plays automatically once per user and
// role; "Take the tour" replays it a single time and it is marked done again.

const START_EVENT = "aiviate:start-tour";

export function tourStorageKey(user) {
  return `aiviate_tour_done:${user?.role || "admin"}:${user?.id || "anon"}`;
}

export function isTourDone(key) {
  try { return localStorage.getItem(key) === "done"; }
  catch { return false; }
}

export function markTourDone(key) {
  try { localStorage.setItem(key, "done"); }
  catch {
    // Private mode: the tour may show again next visit, which is harmless.
  }
}

export function replayTour() {
  window.dispatchEvent(new CustomEvent(START_EVENT));
}

export function onReplayTour(handler) {
  window.addEventListener(START_EVENT, handler);
  return () => window.removeEventListener(START_EVENT, handler);
}

export const DISPATCHER_TOUR = [
  {
    title: "Cleared for take-off",
    body: "Welcome to Aiviate. This one-minute tour shows where everything lives. You can replay it any time from your profile menu → Take the tour.",
  },
  {
    route: "/",
    target: ".chat-composer",
    title: "Ask Aiviate anything",
    body: "Type questions like \"show jobs\" or \"which drivers are free?\". Aiviate answers from your company's own orders, drivers and alerts.",
  },
  {
    route: "/",
    target: '[data-testid="button-toggle-tools"]',
    title: "Tools",
    body: "Search a connected Gmail inbox, or explore sample integrations. Shortcut: type / in the message box.",
  },
  {
    target: '[data-tour="nav-orders"]',
    title: "Orders",
    body: "Orders from your store, a spreadsheet upload or the developer API land here. Import them and Aiviate builds optimised routes.",
  },
  {
    target: '[data-tour="nav-drivers"]',
    title: "Drivers",
    body: "Add each driver here. Aiviate creates their login: give the driver their email and the temporary password it shows so they can sign in to the Driver app.",
  },
  {
    target: '[data-tour="nav-community"]',
    title: "Community",
    body: "Post notices to every driver and read the road updates and questions they share.",
  },
  {
    target: '[data-tour="nav-learn"]',
    title: "Learn",
    body: "Step-by-step guides for dispatchers and drivers, including how the pre-drive fatigue check-in works.",
  },
  {
    target: '[data-testid="button-topbar-profile"]',
    title: "Settings and this tour",
    body: "Profile, integrations, settings and dark mode live here — plus \"Take the tour\" to watch this again.",
  },
];

export const DRIVER_TOUR = [
  {
    title: "Welcome aboard",
    body: "Here's a quick look at your driver workspace. It takes under a minute.",
  },
  {
    route: "/",
    target: '[data-tour="checkin"]',
    title: "Pre-drive check-in",
    body: "Before your first route each day, answer four quick questions about sleep and tiredness. If you're at risk, your dispatcher is told so they can help. Being honest never gets you in trouble.",
  },
  {
    route: "/",
    target: '[data-tour="driver-jobs"]',
    title: "Your deliveries",
    body: "Jobs your dispatcher assigns appear here. Open a job to see the stops in order, navigate, and mark each stop complete.",
  },
  {
    target: '[data-tour="driver-nav-community"]',
    title: "Community",
    body: "Share road updates, ask other drivers a question, and read notices from dispatch.",
  },
  {
    target: '[data-tour="driver-nav-learn"]',
    title: "Learn",
    body: "Guides on using the app and staying alert on the road.",
  },
  {
    target: '[data-tour="driver-tour-btn"]',
    title: "Replay any time",
    body: "Tap here to watch this tour again.",
  },
];
