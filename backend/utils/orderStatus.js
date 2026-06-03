// Estados validos para orders_controls.
// Flujo: pending -> sent -> partial -> completed (o cancelled en cualquier momento previo a completed)
const ORDER_STATUSES = ["pending", "sent", "partial", "completed", "cancelled"];

const ORDER_STATUSES_EDITABLE = ["pending", "sent", "partial"];

const ORDER_STATUSES_TERMINAL = ["completed", "cancelled"];

module.exports = { ORDER_STATUSES, ORDER_STATUSES_EDITABLE, ORDER_STATUSES_TERMINAL };
