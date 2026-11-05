// Aiviate subscription plans (South African rand, per month). Keep in step with the Pricing
// section on the marketing site (artifacts/aiviate-website/index.html).
export const PLANS = [
  {
    id: "starter",
    name: "Starter",
    tagline: "Software only",
    price: 299,
    unit: "per driver / month",
    unitShort: "/driver/mo",
    features: [
      "AI driving assistant on the driver's smartphone",
      "Hands-free interaction by phone",
      "Basic fleet dashboard",
    ],
    term: null,
    fit: "Independent delivery drivers",
  },
  {
    id: "plus",
    name: "Plus",
    tagline: "AI + earpiece",
    price: 699,
    unit: "per driver / month",
    unitShort: "/driver/mo",
    features: [
      "Everything in Starter",
      "Earpiece included",
      "Hands-free interaction by earpiece",
      "Full fleet dashboard",
    ],
    term: "12-month agreement for the earpiece",
    fit: "Professional drivers",
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "AI + earpiece + dashcam",
    price: 1299,
    unit: "per vehicle / month",
    unitShort: "/vehicle/mo",
    features: [
      "Everything in Plus",
      "Earpiece and compatible dashcam included",
      "Supported camera intelligence (planned)",
      "Advanced fleet dashboard",
    ],
    term: "24-month agreement for the devices",
    fit: "Fleet customers",
  },
];

export const formatPlanPrice = (price) => `R${Number(price).toLocaleString("en-US")}`;
export const findPlan = (id) => PLANS.find((plan) => plan.id === id) || null;
