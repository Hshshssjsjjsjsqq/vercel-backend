import express from 'express';
import {
    signupUser,
    requestSignupOtp,
    loginUser,
    getAllUsers,
    adminLogin,
    requestAdminOtp,
    verifyAdminOtpAndResetPassword,
    requestUserOtp,
    verifyUserOtpAndResetPassword
} from '../controllers/authController.js';

const router = express.Router();

router.post('/signup', signupUser);
router.post('/signup/request-otp', requestSignupOtp);
router.post('/login', loginUser);
router.post('/admin-login', adminLogin);
router.post('/admin-forgot-password/request-otp', requestAdminOtp);
router.post('/admin-forgot-password/verify-otp', verifyAdminOtpAndResetPassword);
router.post('/user-forgot-password/request-otp', requestUserOtp);
router.post('/user-forgot-password/verify-otp', verifyUserOtpAndResetPassword);
router.get('/users', getAllUsers);

export default router;
