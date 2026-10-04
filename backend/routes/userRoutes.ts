import express, { Router } from "express";
import multer from "multer";
import {
    updateUserAvatar,
    registerUser,
    verifyRegistrationOtp,
    resendRegistrationOtp,
    forgotPassword,
    resetPassword,
    loginUser,
    googleLogin,
    logoutUser,
    getUserProfile,
    updateUserProfile,
    refreshUserToken,
} from "../controllers/userController.js";
import { protect } from "../middleware/auth.js";
import rateLimit from "express-rate-limit";
import { registerValidation, loginValidation, profileUpdateValidation, validateResult } from "../middleware/validationMiddleware.js";

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    message: { message: "Too many attempts from this IP, please try again after 15 minutes" }
});

// OTP verify/resend need a little more headroom than login (typos happen);
// abuse is still capped by per-email cooldowns + attempt limits in Redis.
const otpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 15,
    message: { message: "Too many attempts from this IP, please try again after 15 minutes" }
});

const router: Router = express.Router();

router.post("/register", authLimiter, registerValidation, validateResult, registerUser);
router.post("/verify-otp", otpLimiter, verifyRegistrationOtp);
router.post("/resend-otp", otpLimiter, resendRegistrationOtp);
router.post("/forgot-password", otpLimiter, forgotPassword);
router.post("/reset-password", otpLimiter, resetPassword);
router.post("/login", authLimiter, loginValidation, validateResult, loginUser);
router.post("/logout", protect, logoutUser);
router.post("/google", authLimiter, googleLogin);
router.post("/refresh", refreshUserToken);
router.route("/profile")
    .get(protect, getUserProfile)
    .put(protect, profileUpdateValidation, validateResult, updateUserProfile);

// Profile photo — kept in memory and streamed straight to Cloudinary
const avatarUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});
router.put("/avatar", protect, avatarUpload.single("avatar"), updateUserAvatar);

export default router;
