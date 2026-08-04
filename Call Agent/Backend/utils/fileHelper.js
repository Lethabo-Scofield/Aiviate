const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "../data/orders.json");

function loadOrders() {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function saveOrders(orders) {
    fs.writeFileSync(filePath, JSON.stringify(orders, null, 2));
}

module.exports = {
    loadOrders,
    saveOrders
};