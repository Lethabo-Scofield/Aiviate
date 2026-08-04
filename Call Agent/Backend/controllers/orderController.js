const { loadOrders, saveOrders } = require("../utils/fileHelper");

exports.getAllOrders = (req, res) => {
    res.json(loadOrders());
};

exports.getOrder = (req, res) => {
    console.log("req.params =", req.params);

    const { orderNumber } = req.params;

    const orders = loadOrders();

    const order = orders.find(
        o => o.orderNumber === orderNumber
    );

    if (!order) {
        return res.status(404).json({
            success: false,
            message: "Order not found"
        });
    }

    res.json({
        success: true,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        orderStatus: order.orderStatus,
        deliveryStatus: order.deliveryStatus,
        courier: order.courier,
        estimatedDelivery: order.estimatedDelivery
    });
};

exports.rescheduleDelivery = (req, res) => {
    console.log(req.body);

    const { orderNumber, newDate } = req.body.args;

    if (!orderNumber || !newDate) {
        return res.status(400).json({
            success: false,
            message: "orderNumber and newDate are required"
        });
    }

    const orders = loadOrders();

    const order = orders.find(
        o => o.orderNumber === orderNumber
    );

    if (!order) {
        return res.status(404).json({
            success: false,
            message: "Order not found"
        });
    }

    order.estimatedDelivery = newDate;

    saveOrders(orders);

    res.json({
        success: true,
        message: `Delivery for ${orderNumber} has been rescheduled to ${newDate}.`,
        order
    });
};

exports.updateDelivery = (req, res) => {
    const orders = loadOrders();

    const order = orders.find(
        o => o.orderNumber === req.params.orderNumber
    );

    if (!order) {
        return res.status(404).json({
            success: false,
            message: "Order not found"
        });
    }

    if (!req.body.estimatedDelivery) {
        return res.status(400).json({
            success: false,
            message: "estimatedDelivery is required"
        });
    }

    order.estimatedDelivery = req.body.estimatedDelivery;

    if (req.body.deliveryInstructions) {
        order.deliveryInstructions = req.body.deliveryInstructions;
    }

    saveOrders(orders);

    res.json({
        success: true,
        message: "Delivery updated successfully",
        order
    });
};

exports.createOrder = (req, res) => {
    const orders = loadOrders();

    const newOrder = req.body;

    const exists = orders.find(
        o => o.orderNumber === newOrder.orderNumber
    );

    if (exists) {
        return res.status(400).json({
            success: false,
            message: "Order number already exists."
        });
    }

    orders.push(newOrder);

    saveOrders(orders);

    res.status(201).json({
        success: true,
        message: "Order created successfully.",
        order: newOrder
    });
};

exports.deleteOrder = (req, res) => {
    const orders = loadOrders();

    const index = orders.findIndex(
        o => o.orderNumber === req.params.orderNumber
    );

    if (index === -1) {
        return res.status(404).json({
            success: false,
            message: "Order not found."
        });
    }

    const deletedOrder = orders.splice(index, 1);

    saveOrders(orders);

    res.json({
        success: true,
        message: "Order deleted successfully.",
        order: deletedOrder
    });
};

exports.getCustomerOrders = (req, res) => {
    const orders = loadOrders();

    const customerOrders = orders.filter(
        o => o.customerId === req.params.customerId
    );

    res.json({
        success: true,
        orders: customerOrders
    });
};

exports.getTracking = (req, res) => {
    const orders = loadOrders();

    const order = orders.find(
        o => o.trackingNumber === req.params.trackingNumber
    );

    if (!order) {
        return res.status(404).json({
            success: false,
            message: "Tracking number not found."
        });
    }

    res.json({
        success: true,
        order
    });
};