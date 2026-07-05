import nodemailer from "nodemailer";
import type { Env } from "@clipflow/config";

function getTransport(env: Env): nodemailer.Transporter | null {
  if (!env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER && env.SMTP_PASS
      ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
      : undefined,
  });
}

const PASSWORD_RESET_HTML = (name: string, resetUrl: string) => `<!DOCTYPE html>
<html lang="en" xmlns="https://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <title>Reset your ClipFlow password</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f0; color: #1a1a1a; }
    table { border-collapse: collapse; width: 100%; }
    a { text-decoration: none; }
    @media only screen and (max-width: 600px) {
      .container { width: 100% !important; }
      .content { padding: 32px 24px !important; }
      .button { width: 100% !important; display: block !important; text-align: center !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f0;">
  <table role="presentation" style="width:100%;background-color:#f5f5f0;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <div class="container" style="max-width:480px;width:100%;">
          <table role="presentation" style="width:100%;">
            <tr>
              <td align="center" style="padding-bottom:32px;">
                <svg width="132" height="28" viewBox="0 0 132 28" xmlns="http://www.w3.org/2000/svg" style="display:block;">
                  <g>
                    <rect x="1" y="2" width="24" height="24" rx="6" fill="#E8B14A"/>
                    <path d="M9 9 L19 14 L9 19 Z" fill="#1a1a1a"/>
                    <text x="32" y="19" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="15" font-weight="600" fill="#1a1a1a" letter-spacing="-0.01em">ClipFlow</text>
                  </g>
                </svg>
              </td>
            </tr>
          </table>
          <table role="presentation" style="width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04),0 1px 2px rgba(0,0,0,0.06);">
            <tr>
              <td class="content" style="padding:40px 32px;">
                <h1 style="font-size:20px;font-weight:600;color:#1a1a1a;margin-bottom:8px;">Reset your password</h1>
                <p style="font-size:15px;line-height:1.6;color:#555555;margin-bottom:24px;">
                  Hi${name ? " " + name : ""}, we received a request to reset the password for your ClipFlow account. Click the button below to set a new one.
                </p>
                <table role="presentation" style="width:100%;margin-bottom:24px;">
                  <tr>
                    <td align="center">
                      <a href="${resetUrl}" class="button" style="display:inline-block;padding:14px 32px;background-color:#E8B14A;color:#1a1a1a;font-size:15px;font-weight:600;border-radius:8px;letter-spacing:-0.01em;">
                        Reset password
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="font-size:13px;line-height:1.5;color:#999999;margin-bottom:8px;">
                  If you didn't request this, you can safely ignore this email — your password won't change unless you click the button above.
                </p>
                <p style="font-size:13px;line-height:1.5;color:#999999;">
                  This link expires in 1 hour.
                </p>
              </td>
            </tr>
          </table>
          <table role="presentation" style="width:100%;">
            <tr>
              <td align="center" style="padding:24px 16px 0;">
                <p style="font-size:12px;color:#999999;line-height:1.5;">
                  ClipFlow — Upload once, schedule everywhere.
                </p>
              </td>
            </tr>
          </table>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;

export interface SendPasswordResetEmailOptions {
  env: Env;
  to: string;
  name: string | null;
  resetToken: string;
}

export async function sendPasswordResetEmail(
  opts: SendPasswordResetEmailOptions,
): Promise<void> {
  const resetUrl = `${opts.env.WEB_ORIGIN}/reset-password/${opts.resetToken}`;

  const transport = getTransport(opts.env);
  if (!transport) {
    console.log(`\n[ClipFlow] Password reset link for ${opts.to}: ${resetUrl}\n`);
    return;
  }

  await transport.sendMail({
    from: opts.env.SMTP_FROM,
    to: opts.to,
    subject: "Reset your ClipFlow password",
    html: PASSWORD_RESET_HTML(opts.name ?? "", resetUrl),
  });
}
