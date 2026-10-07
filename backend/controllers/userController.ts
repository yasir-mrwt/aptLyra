import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import bcrypt from "bcrypt";
import { userRepository } from "../models/User.js";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { refreshTokenRepository } from "../models/RefreshToken.js";
import { emailService } from "../services/emailService.js";
import redis from "../config/redisConfig.js";
import cloudinary from "../config/cloudinary.js";

// Augment Express Request interface to include the user
import { AuthenticatedRequest } from "../types/express.js";

// ── Email verification / password reset key helpers (Redis, auto-expiring) ──
const OTP_TTL_SECONDS = 10 * 60;        // pending registration + OTP validity
const RESET_TTL_SECONDS = 15 * 60;      // password reset link validity
const RESEND_COOLDOWN_SECONDS = 60;     // min gap between OTP/reset emails
const MAX_OTP_ATTEMPTS = 5;

const pendingRegKey = (email: string) => `pending-reg:${email.trim().toLowerCase()}`;
const otpCooldownKey = (email: string) => `otp-cooldown:${email.trim().toLowerCase()}`;
const resetTokenKey = (tokenHash: string) => `pwd-reset:${tokenHash}`;
const resetCooldownKey = (email: string) => `reset-cooldown:${email.trim().toLowerCase()}`;

const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const generateOtp = () => crypto.randomInt(100000, 1000000).toString();

interface PendingRegistration {
  name: string;
  email: string;
  passwordHash: string;
  otpHash: string;
  attempts: number;
  /** Set when the email already belongs to a Google-only account — verifying
   * the OTP links a password to THAT account instead of creating a new one. */
  linkToUserId?: string;
}

/**
 * Generates a JWT access token and a refresh token, saves the refresh token to Redis,
 * and sets them as HttpOnly cookies in the response.
 * @param {Response} res - Express response object.
 * @param {string} id - User ID to sign the token for.
 */
const generateTokenInCookie = async (res: Response, id: string) => {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) throw new Error("JWT_SECRET is not defined");

    // Short-lived access token
    const accessToken = jwt.sign({ id }, jwtSecret, { expiresIn: "15m" });

    // Long-lived refresh token
    const refreshTokenString = crypto.randomBytes(40).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await refreshTokenRepository.create(id, refreshTokenString, expiresAt);

    res.cookie("jwt", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV !== "development",
        sameSite: process.env.NODE_ENV !== "development" ? "none" : "lax",
        maxAge: 15 * 60 * 1000, // 15 mins
    });

    res.cookie("refresh_jwt", refreshTokenString, {
        httpOnly: true,
        secure: process.env.NODE_ENV !== "development",
        sameSite: process.env.NODE_ENV !== "development" ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
};

/**
 * @desc Start registration — sends a 6-digit OTP to the email for verification.
 *       The user record is only created AFTER the OTP is verified.
 *       If the email belongs to a Google-only account, verification links a
 *       password to that same account (no duplicate users per email).
 * @route POST /api/user/register
 * @access Public
 */
const registerUser = asyncHandler(async (req: Request, res: Response) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
        res.status(400);
        throw new Error("Please provide all fields");
    }

    const existing = await userRepository.findByEmail(email);

    // A password already exists for this email → true duplicate.
    if (existing && existing.password) {
        res.status(400);
        throw new Error("User already exists");
    }

    // Cooldown so the endpoint can't be used to spam inboxes
    const cooldownSet = await redis.set(otpCooldownKey(email), "1", "EX", RESEND_COOLDOWN_SECONDS, "NX");
    if (cooldownSet !== "OK") {
        res.status(429);
        throw new Error("An OTP was recently sent to this email. Please wait a minute before retrying.");
    }

    const otp = generateOtp();
    const salt = await bcrypt.genSalt(10);
    const pending: PendingRegistration = {
        name,
        email: email.trim().toLowerCase(),
        passwordHash: await bcrypt.hash(password, salt),
        otpHash: sha256(otp),
        attempts: 0,
        linkToUserId: existing?._id, // google-only account → link on verify
    };

    await redis.set(pendingRegKey(email), JSON.stringify(pending), "EX", OTP_TTL_SECONDS);
    await emailService.sendOtpEmail(pending.email, name, otp);

    res.status(200).json({
        requiresVerification: true,
        email: pending.email,
        message: "Verification code sent to your email",
    });
});

/**
 * @desc Verify the registration OTP → create (or link) the account and log in.
 * @route POST /api/user/verify-otp
 * @access Public
 */
const verifyRegistrationOtp = asyncHandler(async (req: Request, res: Response) => {
    const { email, otp } = req.body;
    if (!email || !otp) {
        res.status(400);
        throw new Error("Email and OTP are required");
    }

    const key = pendingRegKey(email);
    const raw = await redis.get(key);
    if (!raw) {
        res.status(400);
        throw new Error("OTP expired or not found. Please register again.");
    }

    const pending = JSON.parse(raw) as PendingRegistration;

    if (pending.attempts >= MAX_OTP_ATTEMPTS) {
        await redis.del(key);
        res.status(429);
        throw new Error("Too many incorrect attempts. Please register again.");
    }

    if (sha256(String(otp).trim()) !== pending.otpHash) {
        pending.attempts += 1;
        const ttl = await redis.ttl(key);
        await redis.set(key, JSON.stringify(pending), "EX", Math.max(ttl, 30));
        res.status(400);
        throw new Error(`Incorrect OTP. ${MAX_OTP_ATTEMPTS - pending.attempts} attempts remaining.`);
    }

    // OTP correct → create the user, or link a password to the Google account
    let user;
    if (pending.linkToUserId) {
        user = await userRepository.findById(pending.linkToUserId);
        if (!user) {
            res.status(400);
            throw new Error("Account no longer exists. Please register again.");
        }
        user.password = pending.passwordHash; // already bcrypt-hashed
        await userRepository.save(user);
    } else {
        user = await userRepository.create({
            name: pending.name,
            email: pending.email,
            passwordHash: pending.passwordHash,
        });
    }

    await redis.del(key);
    await generateTokenInCookie(res, user._id);

    // Fire-and-forget — never block signup on the welcome mail
    emailService.sendWelcomeEmail(user.email, user.name).catch((err) =>
        console.error("[Email] Welcome email failed:", err.message)
    );

    res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        preferredRole: user.preferredRole,
        avatarUrl: user.avatarUrl,
        provider: user.googleId ? "google" : "email",
    });
});

/**
 * @desc Resend the registration OTP (60s cooldown).
 * @route POST /api/user/resend-otp
 * @access Public
 */
const resendRegistrationOtp = asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body;
    if (!email) {
        res.status(400);
        throw new Error("Email is required");
    }

    const key = pendingRegKey(email);
    const raw = await redis.get(key);
    if (!raw) {
        res.status(400);
        throw new Error("No pending registration found. Please register again.");
    }

    const cooldownSet = await redis.set(otpCooldownKey(email), "1", "EX", RESEND_COOLDOWN_SECONDS, "NX");
    if (cooldownSet !== "OK") {
        res.status(429);
        throw new Error("Please wait a minute before requesting another code.");
    }

    const pending = JSON.parse(raw) as PendingRegistration;
    const otp = generateOtp();
    pending.otpHash = sha256(otp);
    pending.attempts = 0;

    await redis.set(key, JSON.stringify(pending), "EX", OTP_TTL_SECONDS);
    await emailService.sendOtpEmail(pending.email, pending.name, otp);

    res.status(200).json({ message: "A new verification code has been sent" });
});

/**
 * @desc Request a password reset link. Works for password AND Google-only
 *       accounts (resetting sets a password on the same account — linking).
 *       Always responds 200 to avoid leaking which emails exist.
 * @route POST /api/user/forgot-password
 * @access Public
 */
const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
    const { email } = req.body;
    if (!email) {
        res.status(400);
        throw new Error("Email is required");
    }

    const user = await userRepository.findByEmail(email);

    if (user) {
        const cooldownSet = await redis.set(resetCooldownKey(email), "1", "EX", RESEND_COOLDOWN_SECONDS, "NX");
        if (cooldownSet === "OK") {
            const token = crypto.randomBytes(32).toString("hex");
            await redis.set(resetTokenKey(sha256(token)), user._id, "EX", RESET_TTL_SECONDS);

            const frontendUrl = (process.env.PUBLIC_FRONTEND_URL || process.env.FRONTEND_URL || "http://localhost:5173").split(",")[0].trim();
            const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

            await emailService.sendPasswordResetEmail(user.email, user.name, resetUrl);
        }
    }

    res.status(200).json({
        message: "If an account exists for this email, a reset link has been sent.",
    });
});

/**
 * @desc Reset the password using the emailed token. Revokes all refresh
 *       tokens so every existing session is signed out.
 * @route POST /api/user/reset-password
 * @access Public
 */
const resetPassword = asyncHandler(async (req: Request, res: Response) => {
    const { token, password } = req.body;
    if (!token || !password) {
        res.status(400);
        throw new Error("Token and new password are required");
    }
    if (String(password).length < 6) {
        res.status(400);
        throw new Error("Password must be at least 6 characters long");
    }

    const key = resetTokenKey(sha256(String(token)));
    const userId = await redis.get(key);
    if (!userId) {
        res.status(400);
        throw new Error("Reset link is invalid or has expired");
    }

    const user = await userRepository.findById(userId);
    if (!user) {
        await redis.del(key);
        res.status(400);
        throw new Error("Account not found");
    }

    await userRepository.save(user, { plainPassword: password });
    await redis.del(key);
    await refreshTokenRepository.deleteAllForUser(user._id);

    emailService.sendPasswordChangedEmail(user.email, user.name).catch((err) =>
        console.error("[Email] Password-changed email failed:", err.message)
    );

    res.status(200).json({ message: "Password reset successful. Please log in with your new password." });
});

/**
 * @desc Authenticate user and get token.
 * @route POST /api/user/login
 * @access Public
 */
const loginUser = asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;
    if (!email || !password) {
        res.status(400);
        throw new Error("Please provide all fields");
    }

    const user = await userRepository.findByEmail(email);

    if (user && (await userRepository.matchPassword(user, password))) {
        await generateTokenInCookie(res, user._id);
        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            preferredRole: user.preferredRole,
            avatarUrl: user.avatarUrl,
            provider: user.googleId ? "google" : "email",
        });
    } else {
        res.status(401);
        throw new Error("Invalid email or password");
    }
});

/**
 * @desc Google OAuth Login / Registration.
 * @route POST /api/user/google-login
 * @access Public
 */
const googleLogin = asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.body;
    if (!token) {
        res.status(400);
        throw new Error("Please provide token");
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId) {
        res.status(500);
        throw new Error("Google Client ID not configured");
    }

    const client = new OAuth2Client(clientId, clientSecret);

    const ticket = await client.verifyIdToken({
        idToken: token,
        audience: clientId,
    });

    const payload = ticket.getPayload();
    if (!payload) {
        res.status(400);
        throw new Error("Invalid Google token");
    }

    const { email_verified, name, email, sub: googleId, picture } = payload;

    if (!email_verified || !email) {
        res.status(400);
        throw new Error("Email not verified by Google");
    }

    const user = await userRepository.findByEmail(email);

    if (user) {
        // Link googleId + keep the Google profile photo fresh
        if (!user.googleId || (picture && user.avatarUrl !== picture)) {
            user.googleId = user.googleId || googleId;
            if (picture) user.avatarUrl = picture;
            await userRepository.save(user);
        }
        await generateTokenInCookie(res, user._id);
        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            preferredRole: user.preferredRole,
            avatarUrl: user.avatarUrl,
            provider: "google",
        });
    } else {
        const newUser = await userRepository.create({
            name: name || email,
            email,
            googleId,
            avatarUrl: picture || undefined,
        });

        if (newUser) {
            await generateTokenInCookie(res, newUser._id);
            emailService.sendWelcomeEmail(newUser.email, newUser.name).catch((err) =>
                console.error("[Email] Welcome email failed:", err.message)
            );
            res.status(201).json({
                _id: newUser._id,
                name: newUser.name,
                email: newUser.email,
                preferredRole: newUser.preferredRole,
                avatarUrl: newUser.avatarUrl,
                provider: "google",
            });
        } else {
            res.status(400);
            throw new Error("Invalid user data");
        }
    }
});

/**
 * @desc Get user profile data.
 * @route GET /api/user/profile
 * @access Private
 */
const getUserProfile = asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    if (authReq.user) {
        res.status(200).json({
            _id: authReq.user._id || authReq.user.id,
            name: authReq.user.name,
            email: authReq.user.email,
            preferredRole: authReq.user.preferredRole,
            avatarUrl: authReq.user.avatarUrl,
            provider: authReq.user.googleId ? "google" : "email",
        });
    } else {
        res.status(401);
        throw new Error("User not found");
    }
});

/**
 * @desc Update user profile data.
 * @route PUT /api/user/profile
 * @access Private
 */
const updateUserProfile = asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    if (authReq.user) {
        const user = await userRepository.findById(authReq.user._id || authReq.user.id);
        if (!user) {
            res.status(401);
            throw new Error("User not found");
        }

        const previousEmail = user.email;

        if (req.body?.email && req.body.email !== user.email) {
            const emailTaken = await userRepository.findByEmail(req.body.email);
            if (emailTaken) {
                res.status(400);
                throw new Error("Email is already in use");
            }
            user.email = req.body.email;
        }

        user.name = req.body?.name || user.name;
        user.preferredRole = req.body?.preferredRole || user.preferredRole;

        await userRepository.save(user, {
            plainPassword: req.body?.password || undefined,
            previousEmail,
        });

        res.status(200).json({
            _id: user._id,
            name: user.name,
            email: user.email,
            preferredRole: user.preferredRole,
            avatarUrl: user.avatarUrl,
            provider: user.googleId ? "google" : "email",
        });
    } else {
        res.status(401);
        throw new Error("User not found");
    }
});

/**
 * @desc Upload a profile photo to Cloudinary and save its URL.
 * @route PUT /api/user/avatar
 * @access Private
 */
const updateUserAvatar = asyncHandler(async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const file = (req as Request & { file?: { buffer: Buffer; mimetype: string } }).file;

    if (!authReq.user) {
        res.status(401);
        throw new Error("Not authorized");
    }
    if (!file) {
        res.status(400);
        throw new Error("No image file provided");
    }
    if (!file.mimetype.startsWith("image/")) {
        res.status(400);
        throw new Error("Only image files are allowed");
    }

    const user = await userRepository.findById(authReq.user._id || authReq.user.id);
    if (!user) {
        res.status(401);
        throw new Error("User not found");
    }

    const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: "preptalk/avatars",
                public_id: `user-${user._id}`,
                overwrite: true,
                resource_type: "image",
                transformation: [{ width: 512, height: 512, crop: "fill", gravity: "face" }],
            },
            (error, uploaded) => {
                if (error || !uploaded) reject(error || new Error("Cloudinary upload failed"));
                else resolve(uploaded as { secure_url: string });
            }
        );
        uploadStream.end(file.buffer);
    });

    user.avatarUrl = result.secure_url;
    await userRepository.save(user);

    res.status(200).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        preferredRole: user.preferredRole,
        avatarUrl: user.avatarUrl,
        provider: user.googleId ? "google" : "email",
    });
});

/**
 * @desc Refresh access token using refresh token.
 * @route POST /api/user/refresh
 * @access Public
 */
const refreshUserToken = asyncHandler(async (req: Request, res: Response) => {
    const incomingRefreshToken = req.cookies.refresh_jwt;

    if (!incomingRefreshToken) {
        res.status(401);
        throw new Error("Refresh token not found");
    }

    // Validate refresh token in Redis (expired tokens are auto-evicted by TTL)
    const storedToken = await refreshTokenRepository.find(incomingRefreshToken);

    if (!storedToken) {
        // Token was not found. For security, we just clear the cookies.
        res.cookie("jwt", "", { maxAge: 0 });
        res.cookie("refresh_jwt", "", { maxAge: 0 });
        res.status(401);
        throw new Error("Invalid refresh token");
    }

    // Token exists, is it expired? (Defensive check — TTL should have evicted it.)
    if (new Date() > new Date(storedToken.expiresAt)) {
        await refreshTokenRepository.delete(incomingRefreshToken);
        res.cookie("jwt", "", { maxAge: 0 });
        res.cookie("refresh_jwt", "", { maxAge: 0 });
        res.status(401);
        throw new Error("Refresh token expired");
    }

    // Valid. Delete the old refresh token (rotation) and issue a new pair
    await refreshTokenRepository.delete(incomingRefreshToken);

    // Generate new pair
    await generateTokenInCookie(res, storedToken.userId);

    res.status(200).json({ message: "Token refreshed successfully" });
});

/**
 * @desc Logout user by clearing HTTP-only JWT cookie.
 * @route POST /api/user/logout
 * @access Private
 */
const logoutUser = asyncHandler(async (req: Request, res: Response) => {
    const incomingRefreshToken = req.cookies.refresh_jwt;
    if (incomingRefreshToken) {
        // Remove token from Redis to prevent reuse
        await refreshTokenRepository.delete(incomingRefreshToken);
    }

    res.cookie("jwt", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV !== "development",
        sameSite: process.env.NODE_ENV !== "development" ? "none" : "lax",
        expires: new Date(0),
    });

    res.cookie("refresh_jwt", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV !== "development",
        sameSite: process.env.NODE_ENV !== "development" ? "none" : "lax",
        expires: new Date(0),
    });

    res.status(200).json({ message: "Logged out successfully" });
});

export {
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
};
