const axios = require("axios");

const AIVIATE_API_URL = (process.env.AIVIATE_API_URL || "http://localhost:8000").replace(/\/$/, "");
const AIVIATE_SERVICE_TOKEN = process.env.AIVIATE_SERVICE_TOKEN || "";

function correlationId(req) {
  return req.headers["x-correlation-id"] || `corr-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isSimulationMode() {
  return (
    process.env.CALL_AGENT_SIMULATION_MODE === "true" ||
    !AIVIATE_SERVICE_TOKEN
  );
}

async function appPost(path, payload, req) {
  if (isSimulationMode()) {
    return {
      simulation: true,
      success: false,
      message: "Call Agent simulation mode is active; no APP mutation was performed.",
      requested_path: path,
      correlation_id: correlationId(req),
    };
  }

  const response = await axios.post(`${AIVIATE_API_URL}${path}`, payload, {
    timeout: 10000,
    headers: {
      "Content-Type": "application/json",
      "X-Aiviate-Service-Token": AIVIATE_SERVICE_TOKEN,
      "X-Correlation-ID": correlationId(req),
    },
  });
  return response.data;
}

module.exports = {
  appPost,
  correlationId,
  isSimulationMode,
};
