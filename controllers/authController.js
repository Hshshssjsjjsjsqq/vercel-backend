import User from "../models/User.js";
import AdminAuth from "../models/AdminAuth.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";

const otpStore = new Map();

const normalizeEmail = (email = "") => String(email).trim().toLowerCase();

const buildOtpKey = (adminId, email) => `${adminId}::${normalizeEmail(email)}`;
const buildUserOtpKey = (email) => `user::${normalizeEmail(email)}`;
const buildSignupOtpKey = (email) => `signup::${normalizeEmail(email)}`;

const tryBootstrapAdminRecord = async (adminId, email) => {
    const envAdminId = process.env.ADMIN_ID;
    const envAdminPassword = process.env.ADMIN_PASSWORD;
    const envAdminEmail = normalizeEmail(process.env.ADMIN_EMAIL || "");

    if (!envAdminId || !envAdminPassword || !envAdminEmail) return null;
    if (adminId !== envAdminId || normalizeEmail(email) !== envAdminEmail) return null;

    const existing = await AdminAuth.findOne({ adminId });
    if (existing) return existing;

    const passwordHash = await bcrypt.hash(envAdminPassword, 10);
    return AdminAuth.create({
        adminId,
        email: envAdminEmail,
        passwordHash,
    });
};

const isEnvAdmin = (adminId) => adminId === process.env.ADMIN_ID;
const getEnvAdminEmail = () => normalizeEmail(process.env.ADMIN_EMAIL || "");

const sendEmailOtp = async ({ email, otp, subject, text }) => {
    const smtpUser = process.env.EMAIL_USER;
    const smtpPassRaw = process.env.EMAIL_PASS;
    const smtpPass = String(smtpPassRaw || "").replace(/\s+/g, "");
    if (smtpUser && smtpPass) {
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: smtpUser,
                pass: smtpPass,
            },
        });

        await transporter.sendMail({
            from: smtpUser,
            to: email,
            subject,
            text,
        });

        return { sent: true };
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL;

    if (!resendApiKey || !fromEmail) {
        return { sent: false };
    }

    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            from: fromEmail,
            to: [email],
            subject,
            text,
        }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to send OTP email: ${text}`);
    }

    return { sent: true };
};

//Signup User
export const signupUser = async (req, res) => {
    try{
        const { name, email, password, otp } = req.body;
        const normalizedEmail = normalizeEmail(email);

        if (!name || !normalizedEmail || !password || !otp) {
            return res.status(400).json({ message: "Name, email, password and OTP are required." });
        }

        // Check if user already exists
        const userExists = await User.findOne({ email: normalizedEmail });
        if(userExists){
            return res.status(400).json({ message: "User already exists" });
        }

        const key = buildSignupOtpKey(normalizedEmail);
        const stored = otpStore.get(key);
        if (!stored) {
            return res.status(400).json({ message: "OTP not found. Please request OTP first." });
        }
        if (Date.now() > stored.expiresAt) {
            otpStore.delete(key);
            return res.status(400).json({ message: "OTP has expired. Please request a new OTP." });
        }
        if (String(stored.otp) !== String(otp)) {
            return res.status(400).json({ message: "Invalid OTP." });
        }

        //Hash password
        const hashPassword = await bcrypt.hash(password, 10);

        //Create User
        await User.create({
            name,
            email: normalizedEmail,
            password: hashPassword
        });

        otpStore.delete(key);

        res.json({ message: "User registered successfully" });
        
    } catch (error) {
        res.status(500).json({ message: "Server error", error });
    }
};

export const requestSignupOtp = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ message: "Email is required." });
        }

        const normalizedEmail = normalizeEmail(email);
        const existing = await User.findOne({ email: normalizedEmail });
        if (existing) {
            return res.status(400).json({ message: "User already exists with this email." });
        }

        const otp = String(Math.floor(100000 + Math.random() * 900000));
        const key = buildSignupOtpKey(normalizedEmail);
        otpStore.set(key, {
            otp,
            expiresAt: Date.now() + 10 * 60 * 1000,
        });

        let emailResult = { sent: false };
        try {
            emailResult = await sendEmailOtp({
                email: normalizedEmail,
                otp,
                subject: "Signup Email Verification OTP",
                text: `Your signup verification OTP is ${otp}. It is valid for 10 minutes.`,
            });
        } catch (_emailError) {
            // Hide provider details from client.
        }

        if (!emailResult.sent) {
            return res.json({
                message: "OTP generated in dev mode. Email delivery is unavailable right now.",
                devOtp: otp,
            });
        }

        res.json({ message: "OTP sent successfully to your email." });
    } catch (error) {
        res.status(500).json({ message: error.message || "Failed to send signup OTP." });
    }
};

//Login User
export const loginUser = async (req, res) => {
    try{
        const { email, password } = req.body;

        // Check if user already exists
        const user = await User.findOne({ email });
        if(!user){
            return res.status(400).json({ message: "User not found" });
        }

        // Compare password
        const match = await bcrypt.compare(password, user.password);
        if(!match){
            return res.status(400).json({ message: "Invalid credentials" });
        }

        user.lastLogin = new Date();
        user.loginCount = (user.loginCount || 0) + 1;
        await user.save();

        //Genrate JWT Token
        const token = jwt.sign(
            {id: user._id},
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );
        res.json({
            message: "Login successful",
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email
            }
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error });
    }
};

export const getAllUsers = async (_req, res) => {
    try {
        const users = await User.find()
            .select("-password")
            .sort({ createdAt: -1 });

        res.json(users);
    } catch (error) {
        res.status(500).json({ message: "Server error", error });
    }
};

export const adminLogin = async (req, res) => {
    try {
        const { adminId, password } = req.body;

        if (!adminId || !password) {
            return res.status(400).json({ message: "Admin ID and password are required." });
        }

        let adminRecord = await AdminAuth.findOne({ adminId });

        if (!adminRecord) {
            const envAdminId = process.env.ADMIN_ID;
            const envAdminPassword = process.env.ADMIN_PASSWORD;
            const envAdminEmail = normalizeEmail(process.env.ADMIN_EMAIL || "");

            if (adminId === envAdminId && password === envAdminPassword) {
                if (envAdminEmail) {
                    const passwordHash = await bcrypt.hash(password, 10);
                    adminRecord = await AdminAuth.create({
                        adminId,
                        email: envAdminEmail,
                        passwordHash,
                    });
                } else {
                    const token = jwt.sign(
                        { role: "admin", adminId },
                        process.env.JWT_SECRET,
                        { expiresIn: "1d" }
                    );
                    return res.json({
                        message: "Admin login successful",
                        token
                    });
                }
            }
        }

        if (!adminRecord) {
            return res.status(401).json({ message: "Invalid admin ID or password" });
        }

        const match = await bcrypt.compare(password, adminRecord.passwordHash);
        if (!match) {
            return res.status(401).json({ message: "Invalid admin ID or password" });
        }

        const token = jwt.sign(
            { role: "admin", adminId },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );

        res.json({
            message: "Admin login successful",
            token
        });
    } catch (error) {
        res.status(500).json({ message: "Server error", error });
    }
};

export const requestAdminOtp = async (req, res) => {
    try {
        const { adminId, email } = req.body;
        if (!adminId || !email) {
            return res.status(400).json({ message: "Admin ID and email are required." });
        }

        let adminRecord = await AdminAuth.findOne({ adminId });
        if (!adminRecord) {
            adminRecord = await tryBootstrapAdminRecord(adminId, email);
        }

        if (!adminRecord) {
            return res.status(404).json({ message: "Admin account not found." });
        }

        const normalizedEmail = normalizeEmail(email);
        const envEmail = getEnvAdminEmail();

        if (normalizeEmail(adminRecord.email) !== normalizedEmail) {
            if (isEnvAdmin(adminId) && envEmail && normalizedEmail === envEmail) {
                adminRecord.email = envEmail;
                await adminRecord.save();
            } else {
                return res.status(400).json({ message: "Email does not match admin account." });
            }
        }

        const otp = String(Math.floor(100000 + Math.random() * 900000));
        const key = buildOtpKey(adminId, normalizedEmail);

        otpStore.set(key, {
            otp,
            expiresAt: Date.now() + 10 * 60 * 1000,
        });

        let emailResult = { sent: false };
        try {
            emailResult = await sendEmailOtp({
                email: normalizedEmail,
                otp,
                subject: "Admin Password Reset OTP",
                text: `Your admin reset OTP is ${otp}. It is valid for 10 minutes.`,
            });
        } catch (_emailError) {
            // Ignore provider details and use clean fallback message below.
        }

        if (!emailResult.sent) {
            return res.json({
                message: "OTP generated in dev mode. Email delivery is unavailable right now.",
                devOtp: otp,
            });
        }

        res.json({ message: "OTP sent successfully to registered email." });
    } catch (error) {
        res.status(500).json({ message: error.message || "Failed to send OTP." });
    }
};

export const verifyAdminOtpAndResetPassword = async (req, res) => {
    try {
        const { adminId, email, otp, newPassword } = req.body;
        if (!adminId || !email || !otp || !newPassword) {
            return res.status(400).json({ message: "Admin ID, email, OTP and new password are required." });
        }

        if (String(newPassword).length < 6) {
            return res.status(400).json({ message: "New password must be at least 6 characters." });
        }

        const normalizedEmail = normalizeEmail(email);
        const key = buildOtpKey(adminId, normalizedEmail);
        const stored = otpStore.get(key);

        if (!stored) {
            return res.status(400).json({ message: "OTP not found. Please request a new OTP." });
        }

        if (Date.now() > stored.expiresAt) {
            otpStore.delete(key);
            return res.status(400).json({ message: "OTP has expired. Please request a new OTP." });
        }

        if (String(stored.otp) !== String(otp)) {
            return res.status(400).json({ message: "Invalid OTP." });
        }

        let adminRecord = await AdminAuth.findOne({ adminId });
        if (!adminRecord) {
            adminRecord = await tryBootstrapAdminRecord(adminId, email);
        }

        if (!adminRecord) {
            return res.status(404).json({ message: "Admin account not found." });
        }

        const envEmail = getEnvAdminEmail();
        if (normalizeEmail(adminRecord.email) !== normalizedEmail) {
            if (isEnvAdmin(adminId) && envEmail && normalizedEmail === envEmail) {
                adminRecord.email = envEmail;
            } else {
                return res.status(400).json({ message: "Email does not match admin account." });
            }
        }

        adminRecord.passwordHash = await bcrypt.hash(newPassword, 10);
        await adminRecord.save();
        otpStore.delete(key);

        res.json({ message: "Admin password changed successfully." });
    } catch (error) {
        res.status(500).json({ message: "Failed to reset admin password." });
    }
};

export const requestUserOtp = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ message: "Email is required." });
        }

        const normalizedEmail = normalizeEmail(email);
        const user = await User.findOne({ email: normalizedEmail });
        if (!user) {
            return res.status(404).json({ message: "User not found with this email." });
        }

        const otp = String(Math.floor(100000 + Math.random() * 900000));
        const key = buildUserOtpKey(normalizedEmail);
        otpStore.set(key, {
            otp,
            expiresAt: Date.now() + 10 * 60 * 1000,
        });

        let emailResult = { sent: false };
        try {
            emailResult = await sendEmailOtp({
                email: normalizedEmail,
                otp,
                subject: "User Password Reset OTP",
                text: `Your user reset OTP is ${otp}. It is valid for 10 minutes.`,
            });
        } catch (_emailError) {
            // Ignore provider details and use clean fallback message below.
        }

        if (!emailResult.sent) {
            return res.json({
                message: "OTP generated in dev mode. Email delivery is unavailable right now.",
                devOtp: otp,
            });
        }

        res.json({ message: "OTP sent successfully to your registered email." });
    } catch (error) {
        res.status(500).json({ message: error.message || "Failed to send OTP." });
    }
};

export const verifyUserOtpAndResetPassword = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;
        if (!email || !otp || !newPassword) {
            return res.status(400).json({ message: "Email, OTP and new password are required." });
        }

        if (String(newPassword).length < 6) {
            return res.status(400).json({ message: "New password must be at least 6 characters." });
        }

        const normalizedEmail = normalizeEmail(email);
        const key = buildUserOtpKey(normalizedEmail);
        const stored = otpStore.get(key);

        if (!stored) {
            return res.status(400).json({ message: "OTP not found. Please request a new OTP." });
        }

        if (Date.now() > stored.expiresAt) {
            otpStore.delete(key);
            return res.status(400).json({ message: "OTP has expired. Please request a new OTP." });
        }

        if (String(stored.otp) !== String(otp)) {
            return res.status(400).json({ message: "Invalid OTP." });
        }

        const user = await User.findOne({ email: normalizedEmail });
        if (!user) {
            return res.status(404).json({ message: "User not found with this email." });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();
        otpStore.delete(key);

        res.json({ message: "User password changed successfully." });
    } catch (error) {
        res.status(500).json({ message: "Failed to reset user password." });
    }
};
