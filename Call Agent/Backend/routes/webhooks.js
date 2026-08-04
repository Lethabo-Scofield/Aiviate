const crypto = require("crypto");
const express = require("express");
const { correlationId, isSimulationMode } = require("../services/aiviateClient");

const router = express.Router();
const seenEvents = new Set();

function verifySignature(req) {
  const secret = process.env.RETELL_WEBHOOK_SECRET;
  if (!secret || isSimulationMode()) return true;
  const signature = req.headers["x-retell-signature"];
  if (!signature) return false;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(req.body || {}))
    .digest("hex");
  const received = Buffer.from(signature);
  const calculated = Buffer.from(expected);
  return received.length === calculated.length && crypto.timingSafeEqual(received, calculated);
}

router.post("/retell", (req, res) => {
  if (!verifySignature(req)) {
    return res.status(401).json({ error: "Invalid Retell webhook signature" });
  }

  const eventId = req.body?.event_id || req.body?.call_id || req.body?.id;
  if (eventId && seenEvents.has(eventId)) {
    return res.json({ duplicate: true, correlation_id: correlationId(req) });
  }
  if (eventId) seenEvents.add(eventId);

  res.json({
    success: true,
    accepted: true,
    simulation_mode: isSimulationMode(),
    correlation_id: correlationId(req),
  });
});

module.exports = router;
