import express from 'express';
import {
    placeOrder,
    createPaymentOrder,
    verifyPaymentAndPlaceOrder,
    getAllOrders,
    getUserOrders,
    cancelUserOrder,
    updateOrderStatus,
    getBusinessInsights,
    downloadInvoicePdf
} from '../controllers/orderController.js';

const router = express.Router();

router.post('/place', placeOrder);
router.post('/create-payment-order', createPaymentOrder);
router.post('/verify-payment', verifyPaymentAndPlaceOrder);
router.get('/admin/insights', getBusinessInsights);
router.get('/admin', getAllOrders);
router.get('/user/:userId', getUserOrders);
router.get('/invoice/:id', downloadInvoicePdf);
router.put('/cancel/:id', cancelUserOrder);
router.put('/:id/status', updateOrderStatus);

export default router;
