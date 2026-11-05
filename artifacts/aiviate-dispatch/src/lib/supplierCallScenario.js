// A scripted, fully simulated "call the supplier" scenario for the workspace assistant.
// Nothing here dials a phone, contacts Retell AI or sends an email: it only builds the
// content for SimulatedSupplierCall to play back. Contacts use reserved .example domains and
// 555 numbers, so they can never reach a real person.

const DEFAULT_SUPPLIER = "Cape Pallet Supplies";
const GENERIC_WORDS = /^(?:the|my|our|a|an|supplier|suppliers|vendor|vendors|them|him|her|it)$/i;
const NAME = String.raw`([A-Z][\w&'.-]*(?:\s+[A-Z][\w&'.-]*){0,3}?)(?=\s+(?:about|regarding|re|to|and|for|on)\b|[.,?!]|$)`;

const STOCK_LINES = [
  "Wooden pallets 1200 x 1000: 40 units",
  "Stretch wrap 500 mm: 12 rolls",
  "Packing tape 48 mm: 6 cartons",
];

export function isRestockRequest(text) {
  return /\b(?:re-?stock(?:ing|s|ed)?|replenish(?:ing)?|reorder(?:ing)?|top\s+up\s+stock)\b/i.test(String(text || ""));
}

export function isSupplierCallRequest(text) {
  const value = String(text || "");
  if (isRestockRequest(value)) return true;
  const wantsCall = /\b(?:call|calls|calling|phone|phoning|ring|dial|retell)\b/i.test(value);
  const aboutSupplier = /\b(?:suppliers?|vendors?|retell)\b/i.test(value);
  return wantsCall && aboutSupplier;
}

function hash(text) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

function supplierNameFrom(text) {
  const value = String(text || "");
  const restockFrom = value.match(new RegExp(String.raw`\b(?:re-?stock|replenish|reorder)\w*\b.*?\bfrom\s+(?:the\s+)?` + NAME));
  if (restockFrom?.[1] && !GENERIC_WORDS.test(restockFrom[1])) return restockFrom[1].trim();
  const named = value.match(new RegExp(String.raw`\b(?:call|phone|ring|dial)\s+(?:the\s+)?` + NAME));
  const name = named?.[1]?.trim();
  return name && !GENERIC_WORDS.test(name) ? name : DEFAULT_SUPPLIER;
}

const clock = (date) => date.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false });

export function buildSupplierCall(text, now = new Date()) {
  const restock = isRestockRequest(text);
  const name = supplierNameFrom(text);
  const seed = hash(name.toLowerCase());
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24) || "supplier";
  const order = String(text || "").match(/\b[A-Z]{2,}-\d{2,}\b/)?.[0] || "AIV-1042";
  const phone = `+27 21 555 ${String(1000 + (seed % 9000)).slice(0, 4)}`;
  const email = `orders@${slug}.example`;
  const first = new Date(now.getTime() + 4000);
  const second = new Date(now.getTime() + 5 * 60 * 1000);
  const callId = `call_sim_${seed.toString(16).slice(0, 6)}${now.getTime().toString(36).slice(-4)}`;
  const signoff = ["Kind regards,", "Dispatch team"];
  const reach = [
    `We tried to call you at ${clock(first)} and again at ${clock(second)}`,
  ];

  const draft = restock
    ? {
        to: email,
        subject: "Restock request: we couldn't reach you by phone",
        body: [
          `Hi ${name} team,`,
          "",
          `${reach[0]} to restock our depot and couldn't get through.`,
          "",
          "We'd like to place this order:",
          ...STOCK_LINES.map((line) => `- ${line}`),
          "",
          "Could you please reply with:",
          "1. Availability and the earliest delivery date",
          "2. Your quote for the order above",
          "3. A contact number we can reach today",
          "",
          ...signoff,
        ].join("\n"),
      }
    : {
        to: email,
        subject: `Order ${order}: we couldn't reach you by phone`,
        body: [
          `Hi ${name} team,`,
          "",
          `${reach[0]} about order ${order} and couldn't get through.`,
          "",
          "Could you please reply with:",
          "1. Whether the order has been dispatched",
          "2. The expected delivery date and time",
          "3. A contact number we can reach today",
          "",
          "Our driver is scheduled for this order, so a quick answer helps us plan the route.",
          "",
          ...signoff,
        ].join("\n"),
      };

  return {
    callId,
    startedAt: now.getTime(),
    purpose: restock ? "restock" : "order-status",
    stock: restock ? STOCK_LINES : null,
    order,
    supplier: { name, phone, email },
    draft,
  };
}
