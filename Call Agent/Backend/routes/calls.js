const express = require("express");
const axios = require("axios");
const { correlationId, isSimulationMode } = require("../services/aiviateClient");

const router = express.Router();
const calls = new Map();

function idempotencyKey(req) {
  return req.headers["idempotency-key"] || req.body?.idempotency_key || null;
}

router.post("/", async (req, res) => {
  const idem = idempotencyKey(req);
  if (idem && calls.has(idem)) {
    return res.json({ duplicate: true, call: calls.get(idem), correlation_id: correlationId(req) });
  }

  if (isSimulationMode() || !process.env.RETELL_API_KEY || !process.env.RETELL_AGENT_ID) {
    const call = {
      call_id: `sim-call-${Date.now()}`,
      status: "simulated",
      tenant_id: req.body?.tenant_id,
      recipient: req.body?.recipient,
      created_at: new Date().toISOString(),
    };
    if (idem) calls.set(idem, call);
    return res.status(201).json({ simulation: true, call, correlation_id: correlationId(req) });
  }

  try {
    const response = await axios.post(
      "https://api.retellai.com/v2/create-phone-call",
      {
        from_number: process.env.RETELL_FROM_NUMBER,
        to_number: req.body?.recipient?.phone,
        agent_id: process.env.RETELL_AGENT_ID,
        metadata: {
          tenant_id: req.body?.tenant_id,
          incident_id: req.body?.incident_id,
          correlation_id: correlationId(req),
        },
      },
      {
        timeout: 10000,
        headers: {
          Authorization: `Bearer ${process.env.RETELL_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );
    const call = response.data;
    if (idem) calls.set(idem, call);
    res.status(201).json({ call, correlation_id: correlationId(req) });
  } catch (err) {
    res.status(502).json({
      error: "Failed to create Retell call",
      detail: err.response?.data || err.message,
      correlation_id: correlationId(req),
    });
  }
});

router.get("/:callId", (req, res) => {
  const call = [...calls.values()].find((item) => item.call_id === req.params.callId);
  if (!call) return res.status(404).json({ error: "Call not found", correlation_id: correlationId(req) });
  res.json({ call, correlation_id: correlationId(req) });
});

module.exports = router;
