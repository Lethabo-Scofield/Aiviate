async function searchOrder() {

    const orderNumber = document
        .getElementById("orderNumber")
        .value
        .trim();

    if (!orderNumber) {

        alert("Please enter an order number.");

        return;

    }

    const order = await getOrder(orderNumber);

    if (!order) {

        alert("Order not found.");

        return;

    }

    document.getElementById("result").style.display = "block";

    document.getElementById("orderNo").textContent =
        order.orderNumber;

    document.getElementById("customer").textContent =
        order.customerName;

    document.getElementById("status").textContent =
        order.orderStatus;

    document.getElementById("delivery").textContent =
        order.deliveryStatus;

    document.getElementById("courier").textContent =
        order.courier;

    document.getElementById("estimated").textContent =
        order.estimatedDelivery;

}