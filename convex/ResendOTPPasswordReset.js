import Resend from "@auth/core/providers/resend";

/** Unbiased 6-digit code via rejection sampling. */
function generateCode() {
  const digits = [];
  while (digits.length < 6) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b < 250 && digits.length < 6) digits.push(b % 10);
    }
  }
  return digits.join("");
}

/**
 * Email OTP for password reset (Password provider `reset` option).
 * Uses the same Resend account/env vars as convex/emails.js:
 *   RESEND_API_KEY, EMAIL_FROM
 */
export const ResendOTPPasswordReset = Resend({
  id: "resend-otp-password-reset",
  apiKey: process.env.RESEND_API_KEY,
  maxAge: 60 * 15, // code valid for 15 minutes
  async generateVerificationToken() {
    return generateCode();
  },
  async sendVerificationRequest({ identifier: email, provider, token }) {
    if (!provider.apiKey) {
      // Local dev without Resend configured: don't block resets.
      console.log(`[dev] RESEND_API_KEY not set — password reset code for ${email}: ${token}`);
      return;
    }
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? "GoTalkify <hello@gotalkify.com>",
        to: [email],
        subject: `${token} is your GoTalkify password reset code`,
        html: `<!doctype html><html><body style="margin:0;background:#F7F5F0;font-family:Arial,Helvetica,sans-serif;color:#14263F">
  <div style="max-width:560px;margin:0 auto;padding:24px">
    <div style="background:#16304F;border-radius:12px 12px 0 0;padding:20px 28px">
      <span style="color:#fff;font-size:20px;font-weight:bold">GoTalkify</span>
    </div>
    <div style="background:#ffffff;border-radius:0 0 12px 12px;padding:28px">
      <h2 style="margin:0 0 16px;font-size:18px;color:#0f172a">Reset your password</h2>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.6">Enter this code to choose a new GoTalkify password:</p>
      <p style="margin:20px 0;text-align:center"><span style="display:inline-block;background:#F0F4F9;border-radius:10px;padding:14px 28px;font-size:28px;font-weight:bold;letter-spacing:8px;color:#16304F">${token}</span></p>
      <p style="margin:0;font-size:12px;color:#64748b">This code expires in 15 minutes. If you didn't ask to reset your password, you can safely ignore this email — your password stays unchanged.</p>
    </div>
  </div></body></html>`,
      }),
    });
    if (!res.ok) {
      throw new Error(`Could not send password reset email: ${await res.text()}`);
    }
  },
});
