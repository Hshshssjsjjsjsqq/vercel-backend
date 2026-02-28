import Order from '../models/Order.js';
import Cart from '../models/Cart.js';
import Product from '../models/product.js';
import User from '../models/User.js';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import PDFDocument from 'pdfkit';

const CANCELLATION_REASONS = [
    "Found a better price elsewhere",
    "Ordered by mistake",
    "Delivery is taking too long",
    "Need to change delivery address",
    "Want to change items or quantity"
];

const getRazorpayClient = () => {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret || keyId === "your_key_id" || keySecret === "your_key_secret") {
        return null;
    }

    return new Razorpay({
        key_id: keyId,
        key_secret: keySecret,
    });
};

const buildOrderFromCart = async ({ userId, address, paymentMethod, paymentStatus, razorpayOrderId, razorpayPaymentId }) => {
    const cart = await Cart.findOne({ userId }).populate('items.productId');
    if (!cart || cart.items.length === 0) {
        throw new Error("Cart is empty");
    }

    const orderItems = cart.items.map(item => ({
        productId: item.productId._id,
        quantity: item.quantity,
        price: item.productId.price,
    }));

    const totalAmount = orderItems.reduce((total, item) => total + (item.price * item.quantity), 0);

    for (const item of cart.items) {
        await Product.findByIdAndUpdate(item.productId._id, { $inc: { stock: -item.quantity } });
    }

    const order = await Order.create({
        userId,
        items: orderItems,
        address,
        totalAmount,
        paymentMethod,
        paymentStatus,
        razorpayOrderId,
        razorpayPaymentId,
    });

    await Cart.findOneAndUpdate({ userId }, { items: [] });
    return order;
};

export const placeOrder = async (req, res) => {
    try {
        const { userId, address } = req.body;
        const order = await buildOrderFromCart({
            userId,
            address,
            paymentMethod: "COD",
            paymentStatus: "Pending",
        });

        res.status(201).json({ message: "Order placed successfully", orderId: order._id });
    } catch (error) {
        if (error.message === "Cart is empty") {
            return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: "Internal server error" });
    }
}

export const createPaymentOrder = async (req, res) => {
    try {
        const { userId } = req.body;
        const razorpay = getRazorpayClient();
        if (!razorpay) {
            return res.status(400).json({ message: "Razorpay keys are not configured on server." });
        }

        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ message: "Cart is empty" });
        }

        const totalAmount = cart.items.reduce((total, item) => total + (item.productId.price * item.quantity), 0);
        const amountInPaise = Math.round(totalAmount * 100);

        const paymentOrder = await razorpay.orders.create({
            amount: amountInPaise,
            currency: "INR",
            receipt: `receipt_${Date.now()}`
        });

        res.status(201).json({
            key: process.env.RAZORPAY_KEY_ID,
            order: paymentOrder,
            amount: totalAmount
        });
    } catch (error) {
        res.status(500).json({ message: "Failed to create online payment order" });
    }
};

export const verifyPaymentAndPlaceOrder = async (req, res) => {
    try {
        const razorpay = getRazorpayClient();
        if (!razorpay) {
            return res.status(400).json({ message: "Razorpay keys are not configured on server." });
        }

        const {
            userId,
            address,
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        } = req.body;

        const signPayload = `${razorpay_order_id}|${razorpay_payment_id}`;
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(signPayload)
            .digest("hex");

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({ message: "Invalid payment signature" });
        }

        const order = await buildOrderFromCart({
            userId,
            address,
            paymentMethod: "Online",
            paymentStatus: "Paid",
            razorpayOrderId: razorpay_order_id,
            razorpayPaymentId: razorpay_payment_id,
        });

        res.status(201).json({ message: "Payment verified and order placed", orderId: order._id });
    } catch (error) {
        if (error.message === "Cart is empty") {
            return res.status(400).json({ message: error.message });
        }
        res.status(500).json({ message: "Failed to verify payment" });
    }
};

export const getAllOrders = async (req, res) => {
    try {
        const { sku = "", skuSort = "none", statusFilter = "all", cancelledSort = "none" } = req.query;

        const orders = await Order.find()
            .populate('userId', 'name email')
            .populate('items.productId', 'title image sku')
            .sort({ createdAt: -1 });

        let filteredOrders = orders;
        const skuFilter = String(sku).trim().toLowerCase();
        if (skuFilter) {
            filteredOrders = filteredOrders.filter((order) =>
                order.items.some((item) =>
                    item?.productId?.sku?.toLowerCase().includes(skuFilter)
                )
            );
        }

        if (skuSort === "asc" || skuSort === "desc") {
            filteredOrders = [...filteredOrders].sort((a, b) => {
                const aSku = a.items.find((item) => item?.productId?.sku)?.productId?.sku || "";
                const bSku = b.items.find((item) => item?.productId?.sku)?.productId?.sku || "";
                return skuSort === "asc" ? aSku.localeCompare(bSku) : bSku.localeCompare(aSku);
            });
        }

        if (statusFilter !== "all") {
            filteredOrders = filteredOrders.filter((order) => order.status === statusFilter);
        }

        if (cancelledSort === "first" || cancelledSort === "last") {
            filteredOrders = [...filteredOrders].sort((a, b) => {
                const aCancelled = a.status === "Cancelled" ? 1 : 0;
                const bCancelled = b.status === "Cancelled" ? 1 : 0;
                return cancelledSort === "first" ? bCancelled - aCancelled : aCancelled - bCancelled;
            });
        }

        res.status(200).json(filteredOrders);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch orders' });
    }
};

export const getUserOrders = async (req, res) => {
    try {
        const { userId } = req.params;
        const orders = await Order.find({ userId })
            .populate('items.productId', 'title image images')
            .sort({ createdAt: -1 });

        res.status(200).json(orders);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch user orders' });
    }
};

export const cancelUserOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const { userId, cancelReason } = req.body;

        if (!cancelReason || !CANCELLATION_REASONS.includes(cancelReason)) {
            return res.status(400).json({ message: 'Please select a valid cancellation reason' });
        }

        const order = await Order.findById(id);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        if (String(order.userId) !== String(userId)) {
            return res.status(403).json({ message: 'You can only cancel your own order' });
        }

        if (["Shipped", "Delivered", "Rejected", "Cancelled"].includes(order.status)) {
            return res.status(400).json({ message: `Order cannot be cancelled once it is ${order.status}` });
        }

        if (!order.stockRestored) {
            for (const item of order.items) {
                await Product.findByIdAndUpdate(item.productId, { $inc: { stock: item.quantity } });
            }
        }

        order.status = "Cancelled";
        order.cancelledBy = "User";
        order.cancelReason = cancelReason;
        order.cancelledAt = new Date();
        order.stockRestored = true;
        await order.save();

        const updatedOrder = await Order.findById(order._id)
            .populate('userId', 'name email')
            .populate('items.productId', 'title image images');

        res.status(200).json(updatedOrder);
    } catch (error) {
        res.status(500).json({ message: 'Failed to cancel order' });
    }
};

export const updateOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const order = await Order.findById(id);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        const shouldRestoreStock = ["Rejected", "Cancelled"].includes(status);
        if (shouldRestoreStock && !order.stockRestored) {
            for (const item of order.items) {
                await Product.findByIdAndUpdate(item.productId, { $inc: { stock: item.quantity } });
            }
            order.stockRestored = true;
        }

        order.status = status;
        await order.save();

        const updatedOrder = await Order.findById(id)
            .populate('userId', 'name email')
            .populate('items.productId', 'title image sku');

        res.status(200).json(updatedOrder);
    } catch (error) {
        res.status(500).json({ message: 'Failed to update order status' });
    }
};

export const getBusinessInsights = async (_req, res) => {
    try {
        const now = new Date();
        const currentPeriodStart = new Date(now);
        currentPeriodStart.setDate(currentPeriodStart.getDate() - 30);

        const previousPeriodStart = new Date(currentPeriodStart);
        previousPeriodStart.setDate(previousPeriodStart.getDate() - 30);

        const [allOrders, currentOrders, previousOrders, totalUsers, totalProducts] = await Promise.all([
            Order.find().select('totalAmount status createdAt'),
            Order.find({ createdAt: { $gte: currentPeriodStart, $lte: now } }).select('totalAmount status createdAt'),
            Order.find({ createdAt: { $gte: previousPeriodStart, $lt: currentPeriodStart } }).select('totalAmount'),
            User.countDocuments(),
            Product.countDocuments()
        ]);

        const totalOrders = allOrders.length;
        const last30DaysOrders = currentOrders.length;
        const previous30DaysOrders = previousOrders.length;

        const totalRevenue = allOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
        const currentRevenue = currentOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
        const previousRevenue = previousOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);

        const orderGrowthPercent =
            previous30DaysOrders === 0
                ? (last30DaysOrders > 0 ? 100 : 0)
                : (((last30DaysOrders - previous30DaysOrders) / previous30DaysOrders) * 100);

        const revenueGrowthPercent =
            previousRevenue === 0
                ? (currentRevenue > 0 ? 100 : 0)
                : (((currentRevenue - previousRevenue) / previousRevenue) * 100);

        const statusCounts = allOrders.reduce((acc, order) => {
            const key = order.status || 'Placed';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});

        const dailyOrdersMap = {};
        for (const order of currentOrders) {
            const key = new Date(order.createdAt).toISOString().slice(0, 10);
            dailyOrdersMap[key] = (dailyOrdersMap[key] || 0) + 1;
        }

        const dailyOrders = Object.entries(dailyOrdersMap)
            .map(([date, count]) => ({ date, count }))
            .sort((a, b) => a.date.localeCompare(b.date));

        res.status(200).json({
            totalOrders,
            last30DaysOrders,
            previous30DaysOrders,
            orderGrowthPercent: Number(orderGrowthPercent.toFixed(2)),
            totalRevenue,
            currentRevenue,
            previousRevenue,
            revenueGrowthPercent: Number(revenueGrowthPercent.toFixed(2)),
            totalUsers,
            totalProducts,
            statusCounts,
            dailyOrders
        });
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch business insights' });
    }
};

export const downloadInvoicePdf = async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.query;

        if (!userId) {
            return res.status(400).json({ message: "User ID is required" });
        }

        const order = await Order.findById(id)
            .populate('userId', 'name email')
            .populate('items.productId', 'title');

        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        }

        if (String(order.userId?._id || order.userId) !== String(userId)) {
            return res.status(403).json({ message: "You can only download your own invoice" });
        }

        if (order.paymentStatus !== "Paid") {
            return res.status(400).json({ message: "Invoice is available only for paid orders" });
        }

        const fileName = `invoice-${order._id}.pdf`;
        const doc = new PDFDocument({ size: 'A4', margin: 50 });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        doc.pipe(res);

        doc.fontSize(22).text('Invoice', { align: 'center' });
        doc.moveDown();
        doc.fontSize(11).text(`Invoice No: INV-${order._id.toString().slice(-8).toUpperCase()}`);
        doc.text(`Order ID: ${order._id}`);
        doc.text(`Order Date: ${new Date(order.createdAt).toLocaleString()}`);
        doc.text(`Payment Method: ${order.paymentMethod}`);
        doc.text(`Payment Status: ${order.paymentStatus}`);
        if (order.razorpayPaymentId) {
            doc.text(`Payment Ref: ${order.razorpayPaymentId}`);
        }
        doc.moveDown();

        doc.fontSize(13).text('Bill To');
        doc.fontSize(11).text(order?.address?.fullName || '-');
        doc.text(order?.userId?.email || '-');
        doc.text(`${order?.address?.addressLine || ''}, ${order?.address?.city || ''}`);
        doc.text(`${order?.address?.state || ''} - ${order?.address?.pincode || ''}`);
        doc.text(`Phone: ${order?.address?.phone || '-'}`);
        doc.moveDown();

        doc.fontSize(13).text('Items');
        doc.moveDown(0.4);

        doc.fontSize(11).text('Product', 50, doc.y, { continued: true });
        doc.text('Qty', 320, doc.y, { continued: true });
        doc.text('Price', 380, doc.y, { continued: true });
        doc.text('Total', 460, doc.y);
        doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).strokeColor('#cbd5e1').stroke();
        doc.moveDown(0.5);

        order.items.forEach((item) => {
            const name = item?.productId?.title || 'Product';
            const qty = Number(item.quantity || 0);
            const price = Number(item.price || 0);
            const lineTotal = qty * price;

            doc.text(name, 50, doc.y, { width: 250 });
            doc.text(String(qty), 320, doc.y - 14);
            doc.text(`Rs ${price.toFixed(2)}`, 380, doc.y - 14);
            doc.text(`Rs ${lineTotal.toFixed(2)}`, 460, doc.y - 14);
            doc.moveDown(0.7);
        });

        doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).strokeColor('#cbd5e1').stroke();
        doc.moveDown();
        doc.fontSize(12).text(`Grand Total: Rs ${Number(order.totalAmount || 0).toFixed(2)}`, { align: 'right' });
        doc.moveDown(2);
        doc.fontSize(10).fillColor('#64748b').text('Thank you for shopping with us.', { align: 'center' });

        doc.end();
    } catch (error) {
        res.status(500).json({ message: 'Failed to generate invoice pdf' });
    }
};
