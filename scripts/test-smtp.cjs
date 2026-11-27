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

console.log('Testing Gmail SMTP connection...');
console.log('Host: smtp.gmail.com:465 (secure: true, TLS strict)');
console.log('Sender Email (GMAIL_USER):', user ? user.replace(/(.{3})(.*)(@.*)/, '$1***$3') : 'MISSING');
console.log('Password set:', Boolean(pass));

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: user,
    pass: pass
  },
  tls: {
    rejectUnauthorized: true
  }
});

transporter.verify((error, success) => {
  if (error) {
    console.error('SMTP Connection FAILED:', error.message);
  } else {
    console.log('SUCCESS: Gmail SMTP connection verified and authenticated!');
  }
});
