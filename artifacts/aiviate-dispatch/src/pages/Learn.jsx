import { useState } from "react";
import { BedDouble, BookOpen, Coffee, Compass, LogIn, MessagesSquare, PlayCircle, Route, Settings2, Truck, Upload, UserPlus } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { replayTour } from "../lib/tour";

const DRIVER_GUIDES = [
  {
    icon: LogIn,
    title: "Signing in",
    steps: [
      "Your company would have given you a login email and a temporary password, or sent you an activation link by email. Use those to sign in.",
      "No details yet? Ask your dispatcher. They create driver accounts on their Drivers page.",
      "Forgot your password? Your dispatcher can reset it and give you a new temporary one.",
    ],
  },
  {
    icon: BedDouble,
    title: "Your daily pre-drive check-in",
    steps: [
      "Before your first route each day, answer four quick questions: how much you slept, how alert you feel, how long you've been awake, and anything else affecting you.",
      "If your answers show a fatigue risk, your dispatcher is notified so they can plan rest or a handover. Being honest keeps you and other road users safe, and never gets you in trouble.",
      "Felt fine this morning but tired now? Check in again any time.",
    ],
  },
  {
    icon: Truck,
    title: "Doing your deliveries",
    steps: [
      "Open a job to see its stops in the best order Aiviate found.",
      "Read the customer notes and time window before you set off for each stop.",
      "Mark each stop complete as soon as it's delivered, so dispatch and the customer see progress.",
    ],
  },
  {
    icon: MessagesSquare,
    title: "Using Community",
    steps: [
      "Post road updates (roadworks, closures, traffic) and safety warnings so other drivers can avoid them.",
      "Ask questions and read notices from dispatch.",
      "Never post customers' names, phone numbers or addresses.",
    ],
  },
];

const DISPATCHER_GUIDES = [
  {
    icon: LogIn,
    title: "Getting into your workspace",
    steps: [
      "Create a company account from the sign-in page, or press Try the demo to explore with sample data.",
      "Invite colleagues from Settings → Members.",
    ],
  },
  {
    icon: UserPlus,
    title: "Adding drivers",
    steps: [
      "Go to Drivers → Add Driver and enter their name, email and vehicle.",
      "Aiviate creates their login. Give the driver their email and the temporary password it shows, so they can sign in to the Driver app.",
      "Block or reset a driver's password from their profile at any time.",
    ],
  },
  {
    icon: Upload,
    title: "Getting orders in",
    steps: [
      "Orders from the built-in store appear on the Orders page automatically.",
      "Or use Routes → Upload & Optimize to drop in a spreadsheet of deliveries.",
      "Developers can push orders in through the REST API (see Integrations).",
    ],
  },
  {
    icon: Route,
    title: "Planning and dispatching",
    steps: [
      "Import orders and Aiviate builds optimised routes for each vehicle.",
      "Assign each route to a driver; it appears on their phone straight away.",
      "Watch progress on Live and Map, and handle problems in Exceptions.",
    ],
  },
  {
    icon: Compass,
    title: "Asking Aiviate",
    steps: [
      "Type questions in the chat, like \"which drivers are free?\" or \"show alerts\".",
      "Open Tools (or type /) to search a connected Gmail inbox or explore sample integrations.",
    ],
  },
  {
    icon: BedDouble,
    title: "Keeping drivers safe",
    steps: [
      "Drivers complete a short fatigue check-in before driving. Medium or high risk raises a fatigue alert for you.",
      "Contact the driver, plan a break or reassign the route. Thank drivers for honest answers.",
      "Use Community notices to share depot changes and safety reminders with every driver.",
    ],
  },
  {
    icon: Settings2,
    title: "Settings and autonomy",
    steps: [
      "Policies decide what Aiviate may do automatically and what needs your approval.",
      "Name your assistant and set its answer style under Settings → Agent.",
    ],
  },
];

const SIGNS = [
  "Yawning a lot or heavy eyelids",
  "Drifting out of your lane or hitting the rumble strip",
  "Missing a turn, sign or exit",
  "Can't remember the last few kilometres",
  "Restless, irritable or daydreaming",
];

const CAUSES = [
  "Less than 7 hours of sleep",
  "Being awake more than 16 hours",
  "Drowsy medication (allergy, cold and some pain tablets)",
  "Skipped meals or not drinking water",
  "Illness, pain or stress",
  "Alcohol, even the night before",
  "The afternoon dip (around 14:00–16:00) and early morning (02:00–06:00)",
];

function Guide({ guide, index }) {
  const Icon = guide.icon;
  return (
    <details className="apple-card group p-0" open={index === 0}>
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F1F3F5]">
          <Icon size={17} className="text-[#111315]" />
        </span>
        <span className="flex-1 text-[15px] font-semibold text-[#111315]">{guide.title}</span>
        <span aria-hidden="true" className="text-[#ADB5BD] transition-transform group-open:rotate-90">›</span>
      </summary>
      <ol className="space-y-2.5 px-4 pb-4 pl-[60px]">
        {guide.steps.map((s, i) => (
          <li key={s} className="relative text-[14px] leading-relaxed text-[#5C636A]">
            <span className="absolute -left-7 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#111315] text-[11px] font-semibold text-white">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
    </details>
  );
}

export default function Learn() {
  const { user } = useAuth();
  const isDriver = user?.role === "driver";
  const [audience, setAudience] = useState(isDriver ? "driver" : "dispatcher");
  const guides = audience === "driver" ? DRIVER_GUIDES : DISPATCHER_GUIDES;

  return (
    <div className="mx-auto max-w-[720px] animate-fade-in">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#868E96]"><BookOpen size={13} /> Learn</p>
          <h1 className="mt-1 text-[24px] font-semibold tracking-tight text-[#111315]">How to use Aiviate</h1>
          <p className="mt-1 text-[14px] text-[#5C636A]">Short guides for every part of the app.</p>
        </div>
        <button type="button" onClick={replayTour} className="apple-btn apple-btn-secondary" data-testid="button-learn-replay-tour">
          <PlayCircle size={15} /> Take the tour
        </button>
      </div>

      <div className="ios-seg mb-5 inline-flex rounded-xl bg-[#F1F3F5] p-1" role="tablist" aria-label="Guides for">
        {[["dispatcher", "For dispatchers"], ["driver", "For drivers"]].map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={audience === key}
            onClick={() => setAudience(key)}
            className={`rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${audience === key ? "bg-white text-[#111315] shadow-sm" : "text-[#868E96]"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {guides.map((g, i) => <Guide key={`${audience}-${g.title}`} guide={g} index={i} />)}
      </div>

      <section className="mt-10" aria-labelledby="alert-title">
        <h2 id="alert-title" className="flex items-center gap-2 text-[18px] font-semibold tracking-tight text-[#111315]">
          <Coffee size={18} /> Staying alert on the road
        </h2>
        <p className="mt-1 text-[14px] text-[#5C636A]">Tiredness causes crashes just like speeding does. Know what causes it and how to spot it.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="apple-card p-4">
            <h3 className="text-[14px] font-semibold text-[#111315]">What makes drivers tired</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[13.5px] text-[#5C636A]">
              {CAUSES.map((c) => <li key={c}>{c}</li>)}
            </ul>
          </div>
          <div className="apple-card p-4">
            <h3 className="text-[14px] font-semibold text-[#111315]">Warning signs</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[13.5px] text-[#5C636A]">
              {SIGNS.map((s) => <li key={s}>{s}</li>)}
            </ul>
          </div>
        </div>
        <div className="apple-card mt-3 p-4">
          <h3 className="text-[14px] font-semibold text-[#111315]">If you notice the signs</h3>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#5C636A]">
            Pull over somewhere safe, take a 15–20 minute nap and drink water, then tell dispatch.
            Opening the window, loud music and coffee don't fix tiredness. Only rest does.
          </p>
        </div>
      </section>
    </div>
  );
}
