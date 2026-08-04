import { RetellWebClient } from "retell-client-js-sdk";

const statusText = document.getElementById("status");
const startButton = document.getElementById("startCall");

const retellWebClient = new RetellWebClient();

let inCall = false;

startButton.addEventListener("click", async () => {

    if (inCall) {

        retellWebClient.stopCall();

        return;

    }

    statusText.innerHTML = "Connecting...";

    try {

        const response = await fetch("http://localhost:3000/api/create-web-call", {
            method: "POST"
        });

        const data = await response.json();

        await retellWebClient.startCall({
            accessToken: data.access_token
        });

    } catch (error) {

        console.error(error);

        statusText.innerHTML = "Unable to start call.";

    }

});

retellWebClient.on("call_started", () => {

    inCall = true;

    startButton.innerHTML = "📞 End Call";

    statusText.innerHTML = "Connected";

});

retellWebClient.on("agent_start_talking", () => {

    statusText.innerHTML = "🤖 AI is speaking...";

});

retellWebClient.on("agent_stop_talking", () => {

    statusText.innerHTML = "🎤 Listening...";

});

retellWebClient.on("call_ended", () => {

    inCall = false;

    startButton.innerHTML = "🎤";

    statusText.innerHTML = "Ready";

});

retellWebClient.on("error", (err) => {

    console.error(err);

    statusText.innerHTML = "Something went wrong.";

});