import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, Cable, ChevronDown, Coins, Moon, Settings2, Sparkles, Sun, UserCircle } from "lucide-react";
import DemoCreditsDialog from "./DemoCreditsDialog";

const INITIAL_CENTS = 2392;
const rand = (cents) => `R${(cents / 100).toFixed(2)}`;

function readCredit(key) {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return INITIAL_CENTS;
    const cents = Number(stored);
    return Number.isSafeInteger(cents) && cents >= 0 && cents <= 100000000 ? cents : INITIAL_CENTS;
  } catch {
    return INITIAL_CENTS;
  }
}

export default function TopBar({
  pathname,
  collapsed,
  user,
  themeMode,
  onToggleTheme,
  onAsk,
  onOpenIntegrations,
  onOpenSettings,
  onOpenProfile,
}) {
  const [query, setQuery] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const profileRef = useRef(null);
  const reduceMotion = useReducedMotion();
  const accountKey = `aiviate_demo_credit_${user?.id ?? user?.email ?? "demo"}`;
  const [creditCents, setCreditCents] = useState(() => readCredit(accountKey));
  const closeUpgrade = useCallback(() => setUpgradeOpen(false), []);

  useEffect(() => {
    setCreditCents(readCredit(accountKey));
  }, [accountKey]);

  useEffect(() => {
    setProfileOpen(false);
    setUpgradeOpen(false);
  }, [pathname]);

  useEffect(() => {
    const outside = (event) => {
      if (!profileRef.current?.contains(event.target)) setProfileOpen(false);
    };
    const escape = (event) => {
      if (event.key === "Escape") setProfileOpen(false);
    };
    window.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", escape);
    };
  }, []);

  const submit = (event) => {
    event.preventDefault();
    const text = query.trim();
    if (!text) return;
    setQuery("");
    onAsk(text);
  };

  const addCredit = (amountRand) => {
    const updated = creditCents + amountRand * 100;
    setCreditCents(updated);
    try { localStorage.setItem(accountKey, String(updated)); }
    catch {
      // The demo still works for this session if storage is unavailable.
    }
    return updated;
  };

  const openMenuAction = (action) => {
    setProfileOpen(false);
    action();
  };

  const currentPage = pathname === "/" ? "Assistant" : ({
    orders: "Orders",
    drivers: "Drivers",
    profile: "Profile",
  }[pathname.split("/")[1]] || pathname.split("/")[1]?.replace(/-/g, " ") || "Workspace");

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-black/[0.06] bg-white/90 backdrop-blur-xl">
        <div className={`flex h-[68px] items-center gap-3 pr-4 sm:pr-6 lg:pr-8 ${
          collapsed ? "pl-16" : "pl-16 lg:pl-8"
        }`}>
          <div className="flex min-w-0 flex-1 items-center gap-5">
            <div className="min-w-0 shrink-0" aria-label={`Workspace, ${currentPage}`}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#868E96]">Workspace</p>
              <p className="truncate text-[13px] font-semibold capitalize leading-tight text-[#111315]">{currentPage}</p>
            </div>
            {pathname !== "/" && (
              <>
                <span aria-hidden="true" className="hidden h-6 border-l border-black/[0.08] sm:block" />
                <form onSubmit={submit} className="hidden min-w-0 max-w-[680px] flex-1 sm:block">
                  <motion.div
                    layoutId={reduceMotion ? undefined : "ask-aiviate-prompt"}
                    transition={{ type: "tween", duration: reduceMotion ? 0 : 0.32, ease: [0.2, 0.8, 0.2, 1] }}
                    className="flex items-center gap-2.5 rounded-xl border border-black/[0.04] bg-[#F1F3F5] px-3 py-2 focus-within:border-[#111315]/40 focus-within:bg-white"
                  >
                    <img src="/logo.png" alt="" className="h-4 w-4 shrink-0" />
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Ask Aiviate anything..."
                      aria-label="Ask Aiviate"
                      data-testid="input-topbar-ask"
                      className="min-w-0 flex-1 bg-transparent text-[13px] text-[#111315] outline-none placeholder:text-[#868E96]"
                    />
                    {query.trim() && (
                      <button type="submit" aria-label="Send to Aiviate" data-testid="button-topbar-ask" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#111315] text-white">
                        <ArrowUpRight size={13} />
                      </button>
                    )}
                  </motion.div>
                </form>
                <button
                  type="button"
                  onClick={() => onAsk("")}
                  aria-label="Ask Aiviate"
                  data-testid="button-mobile-ask"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-black/[0.08] text-[#111315] sm:hidden"
                >
                  <Sparkles size={16} strokeWidth={1.6} />
                </button>
              </>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setUpgradeOpen(true)}
              aria-label={`Company agent credit ${rand(creditCents)}. Add demo credit`}
              data-testid="button-open-credit-upgrade"
              className="flex h-11 items-center gap-1.5 rounded-2xl px-1.5 text-[#111315] transition-colors hover:bg-black/[0.04] active:bg-black/[0.07] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111315] sm:px-2"
            >
              <Coins size={17} strokeWidth={1.7} className="shrink-0 text-[#5C636A]" aria-hidden="true" />
              <span className="hidden text-[11px] font-medium text-[#5C636A] lg:inline">Agent credit</span>
              <span className="text-[13px] font-semibold tabular-nums" data-testid="text-agent-credit">{rand(creditCents)}</span>
            </button>

            <div ref={profileRef} className="relative">
              <button
                type="button"
                onClick={() => setProfileOpen((open) => !open)}
                aria-label={`Profile menu for ${user?.name || "your account"}`}
                aria-haspopup="menu"
                aria-expanded={profileOpen}
                data-testid="button-topbar-profile"
                className="flex h-11 items-center gap-1.5 rounded-2xl px-1.5 transition-colors hover:bg-black/[0.04] active:bg-black/[0.07] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111315] sm:gap-2 sm:px-2"
              >
                <img src="/default-avatar.png" alt="" className="h-8 w-8 rounded-full object-cover" />
                <span className="hidden max-w-28 truncate text-[12px] font-medium text-[#111315] xl:block">{user?.name || "Profile"}</span>
                <ChevronDown size={13} className={`hidden text-[#868E96] transition-transform sm:block ${profileOpen ? "rotate-180" : ""}`} />
              </button>
              <AnimatePresence>
                {profileOpen && (
                  <motion.div
                    role="menu"
                    aria-label="Profile options"
                    initial={reduceMotion ? false : { opacity: 0, y: 6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.98 }}
                    transition={{ duration: reduceMotion ? 0 : 0.16 }}
                    className="absolute right-0 top-[calc(100%+10px)] w-[248px] overflow-hidden rounded-2xl border border-black/[0.08] bg-white p-1.5 shadow-[0_18px_48px_rgba(17,19,21,0.14)]"
                  >
                    <div className="border-b border-black/[0.06] px-2.5 py-2.5">
                      <p className="truncate text-[13px] font-semibold text-[#111315]">{user?.name || "Workspace account"}</p>
                      <p className="truncate text-[11px] text-[#868E96]">{user?.email || user?.role || "Member"}</p>
                    </div>
                    {[
                      { label: "Profile", icon: UserCircle, action: onOpenProfile, testId: "button-menu-profile" },
                      { label: "Integrations", icon: Cable, action: onOpenIntegrations, testId: "button-menu-integrations" },
                      { label: "Settings", icon: Settings2, action: onOpenSettings, testId: "button-menu-settings" },
                    ].map(({ label, icon: Icon, action, testId }) => (
                      <button key={label} type="button" role="menuitem" onClick={() => openMenuAction(action)} data-testid={testId} className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] text-[#343A40] hover:bg-[#F1F3F5] hover:text-[#111315]">
                        <Icon size={15} strokeWidth={1.6} /> {label}
                      </button>
                    ))}
                    <div className="my-1 border-t border-black/[0.06]" />
                    <button type="button" role="menuitem" onClick={() => openMenuAction(onToggleTheme)} data-testid="button-menu-theme" className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] text-[#343A40] hover:bg-[#F1F3F5] hover:text-[#111315]">
                      {themeMode === "dark" ? <Sun size={15} strokeWidth={1.6} /> : <Moon size={15} strokeWidth={1.6} />}
                      {themeMode === "dark" ? "Light mode" : "Dark mode"}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </header>
      <AnimatePresence>
        {upgradeOpen && (
          <DemoCreditsDialog
            balanceCents={creditCents}
            onClose={closeUpgrade}
            onComplete={addCredit}
          />
        )}
      </AnimatePresence>
    </>
  );
}