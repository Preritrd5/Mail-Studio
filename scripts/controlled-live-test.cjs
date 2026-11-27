const fs = require('fs');
const nodemailer = require('nodemailer');

const env = {};
fs.readFileSync('.env', 'utf8').split(/\r?\n/).forEach(l => {
  const i = l.indexOf('=');
  if (i > 0 && !l.trim().startsWith('#')) {
    env[l.substring(0, i).trim()] = l.substring(i + 1).trim().replace(/^["']|["']$/g, '');
  }
});

const user = env.GMAIL_USER;
const pass = env.GMAIL_APP_PASSWORD;

console.log('--- Controlled Real Gmail SMTP Dispatch Verification ---');
console.log('Connecting to smtp.gmail.com:465 with strict TLS...');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: { user, pass },
  tls: { rejectUnauthorized: true }
});

const mailOptions = {
  from: `"SNPSUNEXUS Mail Studio" <${user}>`,
  to: `"Dr. Ananya Sharma" <${user}>`, // Self-addressed to administrative inbox
  subject: `[Controlled Test] SNPSUNEXUS Mail Studio Phase 4 Live SMTP Verification (${new Date().toLocaleTimeString()})`,
  html: `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #E2E8F0; border-radius: 8px;">
      <div style="background-color: #172E58; padding: 15px; border-radius: 6px; color: white; text-align: center;">
        <h2 style="margin: 0; color: #FFFFFF;">SNPSUNEXUS Mail Studio</h2>
        <p style="margin: 5px 0 0 0; color: #C69A4C; font-size: 12px; font-weight: bold; text-transform: uppercase;">Sapthagiri NPS University</p>
      </div>
      <div style="padding: 20px 10px; color: #1E293B; line-height: 1.6;">
        <p>Dear Administrator,</p>
        <p>This is a controlled verification dispatch confirming that <strong>Phase 4: Backend Development & Individual Email Sending</strong> is successfully integrated with Gmail SMTP over secure port 465 SSL/TLS.</p>
        <div style="background-color: #F4F6FA; padding: 12px; border-left: 4px solid #1456AD; border-radius: 4px; font-size: 13px; margin: 15px 0;">
          <strong>Dispatch Metadata:</strong><br>
          • Protocol: SMTP/TLS 1.3 Strict<br>
          • Host: smtp.gmail.com:465<br>
          • Timestamp: ${new Date().toISOString()}<br>
          • Phase: Phase 4 Verified
        </div>
        <p style="font-size: 12px; color: #64748B;">This automated verification is part of the controlled Phase 4 acceptance criteria.</p>
      </div>
    </div>
  `,
  text: `SNPSUNEXUS Mail Studio — Sapthagiri NPS University\nControlled Live SMTP Verification dispatched at ${new Date().toISOString()}.\nPhase 4 Verified.`
};

transporter.sendMail(mailOptions, (err, info) => {
  if (err) {
    console.error('LIVE SMTP DISPATCH FAILED:', err.message);
    process.exit(1);
  } else {
    console.log('✓ CONTROLLED LIVE EMAIL DISPATCHED SUCCESSFULLY!');
    console.log('  SMTP Message ID:', info.messageId);
    console.log('  Server Response:', info.response);
    process.exit(0);
  }
});
