const express = require("express");
const cors = require("cors");

require("dotenv").config();

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
    res.json({ status: "ok", service: "Aiviate Call Agent API" });
});

app.use("/api/orders", require("./routes/orders"));
app.use("/api", require("./routes/retell"));
app.use("/internal/v1/calls", require("./routes/calls"));
app.use("/tools", require("./routes/tools"));
app.use("/webhooks", require("./routes/webhooks"));

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
