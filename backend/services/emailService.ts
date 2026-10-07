/**
 * @file services/emailService.ts
 * @description Transactional email via Nodemailer (SMTP).
 *
 * Emails sent: registration OTP, welcome, password-reset link, password-changed.
 *
 * Configure any SMTP provider through env (Gmail app password, Brevo, Resend
 * SMTP, Mailtrap...). When SMTP is NOT configured, emails are printed to the
 * server console instead — the flows stay fully testable in development.
 */

import nodemailer from "nodemailer";
import logger from "../utils/logger.js";
import addressparser from "nodemailer/lib/addressparser/index.js";
import {BRAND as IDENTITY} from "../config/brand.js";

const BRAND = IDENTITY.name;
const ACCENT = "#8b5cf6";

const smtpConfigured = (): boolean =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

let transporter: nodemailer.Transporter | null = null;

const getTransporter = (): nodemailer.Transporter => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "465", 10),
      secure: (process.env.SMTP_PORT || "465") === "465", // TLS on 465, STARTTLS otherwise
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
};

/** Shared dark-theme shell so every mail looks on-brand. */
const layout = (title: string, bodyHtml: string): string => `
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#0a0a0a;font-family:Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#141416;border:1px solid #26262a;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px;border-bottom:1px solid #26262a;">
              <span aria-label="${BRAND} monogram" style="display:inline-block;background:#ffffff;color:#000;font-weight:800;border-radius:8px;padding:4px 9px;font-size:14px;">${IDENTITY.initial}</span>
              <span style="color:#ffffff;font-weight:800;font-size:16px;margin-left:8px;letter-spacing:0.5px;">${BRAND}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="color:#ffffff;font-size:20px;margin:0 0 16px 0;">${title}</h1>
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;border-top:1px solid #26262a;">
              <p style="color:#6b7280;font-size:11px;margin:0;">
                ${BRAND} — AI Interview Platform · You received this email because of activity on your account.
              </p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

/** Preserve the configured sender mailbox, normalize only application display identity. */
const sender = () => {
  const configured=process.env.EMAIL_FROM || process.env.SMTP_USER || "";
  const addresses=addressparser(configured,{flatten:true});
  if(/[\r\n]/.test(configured) || addresses.length!==1 || !/^[^\s@<>]+@[^\s@<>]+$/.test(addresses[0].address)) {
    throw new Error("Configure one valid sender mailbox in EMAIL_FROM or SMTP_USER");
  }
  return {name:BRAND,address:addresses[0].address};
};

const sendMail = async (to: string, subject: string, html: string, textFallback: string): Promise<void> => {
  if (!smtpConfigured()) {
    // Dev fallback — never block auth flows on missing SMTP config.
    console.log("═".repeat(60));
    console.log(`[EMAIL — DEV MODE, SMTP not configured]`);
    console.log(`To:      ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body:    ${textFallback}`);
    console.log("═".repeat(60));
    return;
  }

  await getTransporter().sendMail({
    from: sender(),
    to,
    subject,
    html,
    text: textFallback,
  });
  logger.info("Email sent", { to, subject });
};

export const emailService = {
  /** 6-digit OTP for email verification during registration. */
  async sendOtpEmail(to: string, name: string, otp: string): Promise<void> {
    const html = layout(
      "Verify your email",
      `<p style="color:#a1a1aa;font-size:14px;line-height:1.6;margin:0 0 24px 0;">
         Hi ${name}, use this code to verify your email and activate your ${BRAND} account.
         It expires in <b style="color:#ffffff;">10 minutes</b>.
       </p>
       <div style="background:#0a0a0a;border:1px solid #26262a;border-radius:12px;padding:20px;text-align:center;margin-bottom:24px;">
         <span style="color:${ACCENT};font-size:34px;font-weight:800;letter-spacing:10px;">${otp}</span>
       </div>
       <p style="color:#6b7280;font-size:12px;margin:0;">Didn't create an account? You can safely ignore this email.</p>`
    );
    await sendMail(to, `${otp} is your ${BRAND} verification code`, html, `Your ${BRAND} verification code is ${otp} (valid for 10 minutes).`);
  },

  /** Sent once the account is verified/created. */
  async sendWelcomeEmail(to: string, name: string): Promise<void> {
    const appUrl = (process.env.PUBLIC_FRONTEND_URL || process.env.FRONTEND_URL || "http://localhost:5173").split(",")[0].trim();
    const html = layout(
      `Welcome to ${BRAND}, ${name}! 🎙️`,
      `<p style="color:#a1a1aa;font-size:14px;line-height:1.6;margin:0 0 24px 0;">
         Your account is live. ${IDENTITY.interviewer} — your AI interviewer — is ready when you are.
         Practice junior technical questions and receive evidence-grounded feedback when grading material is available.
       </p>
       <a href="${appUrl}" style="display:inline-block;background:#ffffff;color:#000;font-weight:700;font-size:14px;padding:12px 28px;border-radius:10px;text-decoration:none;">
         Start your first interview
       </a>`
    );
    await sendMail(to, `Welcome to ${BRAND} — ${IDENTITY.interviewer} is waiting 🎙️`, html, `Welcome to ${BRAND}, ${name}! Practice with ${IDENTITY.interviewer}: ${appUrl}`);
  },

  /** Password reset link (15-minute validity). */
  async sendPasswordResetEmail(to: string, name: string, resetUrl: string): Promise<void> {
    const html = layout(
      "Reset your password",
      `<p style="color:#a1a1aa;font-size:14px;line-height:1.6;margin:0 0 24px 0;">
         Hi ${name}, we received a request to reset your ${BRAND} password.
         This link expires in <b style="color:#ffffff;">15 minutes</b>.
       </p>
       <a href="${resetUrl}" style="display:inline-block;background:${ACCENT};color:#000;font-weight:700;font-size:14px;padding:12px 28px;border-radius:10px;text-decoration:none;margin-bottom:24px;">
         Reset Password
       </a>
       <p style="color:#6b7280;font-size:12px;margin:24px 0 0 0;">
         If the button doesn't work, copy this link:<br/>
         <span style="color:#a1a1aa;word-break:break-all;">${resetUrl}</span><br/><br/>
         Didn't request this? Ignore this email — your password stays unchanged.
       </p>`
    );
    await sendMail(to, `Reset your ${BRAND} password`, html, `Reset your ${BRAND} password (valid 15 minutes): ${resetUrl}`);
  },

  /** Confirmation after a successful password change. */
  async sendPasswordChangedEmail(to: string, name: string): Promise<void> {
    const html = layout(
      "Your password was changed",
      `<p style="color:#a1a1aa;font-size:14px;line-height:1.6;margin:0;">
         Hi ${name}, your ${BRAND} password was just changed and all active sessions were signed out.
         If this wasn't you, reset your password immediately and contact support.
       </p>`
    );
    await sendMail(to, `Your ${BRAND} password was changed`, html, `Your ${BRAND} password was changed. If this wasn't you, reset it immediately.`);
  },
};
