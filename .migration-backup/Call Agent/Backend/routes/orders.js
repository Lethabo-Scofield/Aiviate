const express = require("express");

const router = express.Router();

const controller = require("../controllers/orderController");

router.get("/", controller.getAllOrders);

router.get("/customer/:customerId", controller.getCustomerOrders);

router.get("/tracking/:trackingNumber", controller.getTracking);

router.get("/:orderNumber", controller.getOrder);

router.post("/", controller.createOrder);

router.post("/reschedule", controller.rescheduleDelivery);

router.put("/:orderNumber/delivery", controller.updateDelivery);

router.delete("/:orderNumber", controller.deleteOrder);

router.get(
    "/customer/:customerId",
    controller.getCustomerOrders
);

router.get(
    "/tracking/:trackingNumber",
    controller.getTracking
);

module.exports = router;