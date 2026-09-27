const express = require("express");
const { appPost, correlationId, isSimulationMode } = require("../services/aiviateClient");

const router = express.Router();

function toolArgs(req) {
  return req.body?.args || req.body || {};
}

async function forwardTool(req, res, appPath) {
  try {
    const result = await appPost(appPath, toolArgs(req), req);
    res.json(result);
  } catch (err) {
    const status = err.response?.status || 502;
    res.status(status).json({
      success: false,
      error: err.response?.data?.error || "Aiviate APP API request failed",
      detail: err.response?.data || undefined,
      correlation_id: correlationId(req),
    });
  }
}

router.post("/verify-customer", (req, res) => {
  forwardTool(req, res, "/api/customer-support/verify");
});

router.post("/order-status", (req, res) => {
  forwardTool(req, res, "/api/customer-support/order-status");
});

router.post("/request-reschedule", (req, res) => {
  forwardTool(req, res, "/api/customer-support/request-reschedule");
});

router.post("/confirm-availability", (req, res) => {
  forwardTool(req, res, "/api/customer-support/confirm-availability");
});

router.post("/human-handoff", (req, res) => {
  forwardTool(req, res, "/api/customer-support/human-handoff");
});

router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "Aiviate Call Agent tools",
    simulation_mode: isSimulationMode(),
    correlation_id: correlationId(req),
  });
});

module.exports = router;
