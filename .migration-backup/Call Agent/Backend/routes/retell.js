const express = require("express");
const axios = require("axios");

const router = express.Router();

router.post("/create-web-call", async (req, res) => {
    try {

        const response = await axios.post(
            "https://api.retellai.com/v2/create-web-call",
            {
                agent_id: process.env.RETELL_AGENT_ID
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.RETELL_API_KEY}`,
                    "Content-Type": "application/json"
                }
            }
        );

        res.json(response.data);

    } catch (err) {

        console.log(err.response?.data || err.message);

        res.status(500).json({
            error: "Failed to create web call"
        });

    }
});

module.exports = router;