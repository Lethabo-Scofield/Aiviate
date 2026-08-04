const BASE_URL = "http://localhost:3000/api";

async function getOrder(orderNumber) {

    try {

        const response = await fetch(`${BASE_URL}/orders/${orderNumber}`);

        if (!response.ok) {
            throw new Error("Order not found");
        }

        return await response.json();

    } catch (error) {

        console.error(error);

        return null;

    }

}