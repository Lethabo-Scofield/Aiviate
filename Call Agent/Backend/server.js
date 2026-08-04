const express = require("express");
const cors = require("cors");

require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/orders", require("./routes/orders"));
app.use("/api", require("./routes/retell"));

app.listen(3000, () => {
    console.log("Server running on port 3000");
});