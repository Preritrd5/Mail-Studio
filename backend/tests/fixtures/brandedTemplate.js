/**
 * Official SNPSUNEXUS Branded Email Template Specification
 * Clean, production-quality standalone SaaS email template.
 */

export const DEFAULT_BRANDED_TEMPLATE = {
  id: 'a1b2c3d4-e5f6-47a8-b9c0-d1e2f3a4b5c6',
  name: 'Official SNPSUNEXUS Notification',
  description: 'Primary notification layout with Deep Navy header, Gold accent bar, responsive message card, and action button.',
  category: 'Notifications',
  subject: 'Official Notification — {{recipient_name}}',
  html_content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SNPSUNEXUS Notification</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F4F6FA; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1E293B; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #F4F6FA; padding: 32px 16px;">
    <tr>
      <td align="center">
        <!-- Main Email Container (Max 600px standard) -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(23, 46, 88, 0.05);">
          
          <!-- Brand Header (Deep Navy #172E58) -->
          <tr>
            <td style="background-color: #172E58; padding: 20px 28px; text-align: left;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align: middle;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="vertical-align: middle; padding-right: 10px;">
                          <img src="/assets/snpsunexus-logo.png" alt="SNPSUNEXUS" width="32" height="38" style="display: block; width: 32px; height: 38px; object-fit: contain;" />
                        </td>
                        <td style="border-left: 2px solid rgba(255,255,255,0.3); padding-left: 10px; vertical-align: middle;">
                          <div style="color: #FFFFFF; font-size: 18px; font-weight: 800; letter-spacing: 0.4px;">
                            SNPSUNEXUS
                          </div>
                          <div style="color: #C69A4C; font-size: 11px; font-weight: 600;">
                            Official Communication
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td align="right" style="vertical-align: middle;">
                    <span style="display: inline-block; background-color: rgba(198, 154, 76, 0.2); color: #E7C27B; font-size: 10px; font-weight: 700; padding: 4px 8px; border-radius: 4px; border: 1px solid rgba(198, 154, 76, 0.4); text-transform: uppercase;">
                      Official Notice
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Gold Accent Divider Bar (#C69A4C) -->
          <tr>
            <td style="height: 3px; background-color: #C69A4C;"></td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px 32px 24px 32px; font-size: 14px; line-height: 1.65; color: #1E293B;">
              <h2 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 700; color: #172E58; line-height: 1.3;">
                Official Communication
              </h2>

              <p style="margin: 0 0 16px 0;">
                Dear <strong>{{recipient_name}}</strong>,
              </p>

              <p style="margin: 0 0 16px 0;">
                This is an authenticated notification from <strong>{{institution_name}}</strong>.
              </p>

              <!-- Profile Metadata Box -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; margin: 20px 0;">
                <tr>
                  <td style="padding: 16px; font-size: 13px; line-height: 1.5;">
                    <strong style="color: #172E58; display: block; margin-bottom: 8px;">Recipient Details:</strong>
                    • <strong>Name:</strong> {{recipient_name}}<br>
                    • <strong>Designation:</strong> {{designation}}<br>
                    • <strong>Email:</strong> {{recipient_email}}
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 24px 0;">
                To access your documentation or review details, please follow the link below:
              </p>

              <!-- Call to Action Button (Royal Blue #1456AD) -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
                <tr>
                  <td align="center" style="background-color: #1456AD; border-radius: 8px;">
                    <a href="{{activation_link}}" style="display: inline-block; background-color: #1456AD; color: #FFFFFF; font-weight: 600; font-size: 14px; text-decoration: none; padding: 12px 24px; border-radius: 8px; border: 1px solid #0F438A;">
                      View Details &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 24px 0 0 0; font-size: 13px; color: #64748B;">
                Regards,<br>
                <strong style="color: #172E58;">Administration Team</strong><br>
                {{institution_name}}
              </p>
            </td>
          </tr>

          <!-- Footer Area -->
          <tr>
            <td style="background-color: #172E58; padding: 18px 28px; border-top: 3px solid #C69A4C; font-size: 11px; line-height: 1.5; color: #E2E8F0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="left" style="vertical-align: middle;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="vertical-align: middle; padding-right: 8px;">
                          <img src="/assets/snpsunexus-logo.png" alt="SNPSUNEXUS" width="22" height="26" style="display: block; width: 22px; height: 26px; object-fit: contain;" />
                        </td>
                        <td style="border-left: 1px solid rgba(255,255,255,0.3); padding-left: 8px; vertical-align: middle;">
                          <span style="font-size: 13px; font-weight: 700; color: #FFFFFF; letter-spacing: 0.4px;">
                            SNPSUNEXUS
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td align="right" style="vertical-align: middle; font-size: 11px; color: #E2E8F0;">
                    &copy; {{current_year}} SNPSUNEXUS. All rights reserved.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  text_content: `SNPSUNEXUS
Official Notification

Dear {{recipient_name}},

This is an authenticated notification from {{institution_name}}.

Recipient Details:
- Name: {{recipient_name}}
- Role: {{designation}}
- Email: {{recipient_email}}

To access details, please use the following link:
{{activation_link}}

Regards,
Administration Team
{{institution_name}}`,
};

export const PREMIUM_NOTIFICATION_CARD_TEMPLATE = {
  id: 'e5f6a7b8-c9d0-41e2-f3a4-b5c6d7e8f9a0',
  name: 'SNPSUNEXUS Premium Notification Card',
  description: 'Premium branded transactional email card featuring official shield header, hero notification banner, personalized details card, optional CTA, and verified security footer.',
  category: 'General Notifications',
  subject: 'Official Semester Examination Admit Card & Schedule (v1) — {{recipient_name}}',
  html_content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SNPSUNEXUS Premium Notification Card</title>
  <style>
    body, table, td, p, a, li {
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    @media only screen and (max-width: 520px) {
      .email-container {
        width: 100% !important;
        max-width: 100% !important;
        border-radius: 8px !important;
      }
      .email-content-padding {
        padding: 18px 14px !important;
      }
      .two-col-cell {
        display: block !important;
        width: 100% !important;
        max-width: 100% !important;
        box-sizing: border-box !important;
        padding-bottom: 12px !important;
        padding-right: 0 !important;
        padding-left: 0 !important;
      }
      .two-col-divider {
        display: none !important;
      }
      .header-tagline {
        display: none !important;
      }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #F4F6FA; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1E293B; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #F4F6FA; padding: 32px 12px; margin: 0;">
    <tr>
      <td align="center" valign="top">
        <table role="presentation" class="email-container" width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #FFFFFF; border: 1px solid #CBD5E1; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(23, 46, 88, 0.08);">
          
          <!-- Brand Header -->
          <tr>
            <td style="padding: 20px 28px; background-color: #FFFFFF; border-bottom: 1px solid #EEF2F6;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="left" style="vertical-align: middle;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="vertical-align: middle; padding-right: 12px;">
                          <img src="/assets/snpsunexus-logo.png" alt="SNPSUNEXUS" width="36" height="42" style="display: block; width: 36px; height: 42px; object-fit: contain;" />
                        </td>
                        <td style="border-left: 2px solid #172E58; padding-left: 12px; vertical-align: middle;">
                          <span style="font-size: 19px; font-weight: 800; color: #172E58; letter-spacing: 0.5px; line-height: 1.1; display: block;">
                            SNPSUNEXUS
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td class="header-tagline" align="right" style="vertical-align: middle;">
                    <span style="font-size: 11px; font-style: italic; color: #64748B; font-weight: 500;">
                      Smarter Communication. Greater Impact.
                    </span>
                  </td>
                  <td width="16" align="right" style="vertical-align: top;">
                    <div style="width: 14px; height: 14px; background: linear-gradient(135deg, #C69A4C 0%, #E7C27B 100%); transform: skewX(-20deg); border-radius: 2px;"></div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Hero Banner Section -->
          <tr>
            <td style="padding: 24px 28px 26px 28px; background-color: #172E58; position: relative;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <span style="display: inline-block; color: #C69A4C; font-size: 11px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 8px;">
                      EMAIL NOTIFICATION
                    </span>
                    <h1 style="margin: 0; color: #FFFFFF; font-size: 21px; font-weight: 700; line-height: 1.35; letter-spacing: -0.2px;">
                      Official Semester Examination Admit Card &amp; Schedule (v1)
                    </h1>
                  </td>
                  <td width="30" align="right" valign="top">
                    <div style="width: 22px; height: 8px; background-color: #C69A4C; transform: skewX(-25deg); border-radius: 1px;"></div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Message Body -->
          <tr>
            <td style="padding: 28px 28px 20px 28px; font-size: 14px; line-height: 1.65; color: #1E293B;">
              <p style="margin: 0 0 16px 0; font-size: 15px; font-weight: 600; color: #172E58;">
                Dear {{recipient_name}},
              </p>

              <p style="margin: 0 0 16px 0;">
                This is an authenticated notification from <strong>{{institution_name}}</strong>.<br>
                Your official examination admit card and comprehensive schedule for the {{current_year}} academic term have been generated.
              </p>

              <!-- Information Card -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #EEF4FF; border: 1px solid #D0E0FC; border-radius: 12px; margin: 20px 0; overflow: hidden;">
                <tr>
                  <td style="padding: 18px 20px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom: 16px;">
                      <tr>
                        <td style="background-color: #172E58; color: #FFFFFF; font-size: 12px; font-weight: 700; padding: 6px 14px; border-radius: 6px; letter-spacing: 0.3px;">
                          &#128196;&nbsp; Your Details
                        </td>
                      </tr>
                    </table>

                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td class="two-col-cell" width="50%" valign="top" style="padding-right: 12px;">
                          <div style="margin-bottom: 14px;">
                            <div style="font-size: 11px; color: #64748B; font-weight: 600; margin-bottom: 2px;">
                              &#128100; Candidate Name
                            </div>
                            <div style="font-size: 13px; color: #172E58; font-weight: 700;">
                              {{recipient_name}}
                            </div>
                          </div>
                          <div>
                            <div style="font-size: 11px; color: #64748B; font-weight: 600; margin-bottom: 2px;">
                              &#9993; Institution Email
                            </div>
                            <div style="font-size: 13px; color: #172E58; font-weight: 700;">
                              {{recipient_email}}
                            </div>
                          </div>
                        </td>

                        <td class="two-col-divider" width="1" style="background-color: #D0E0FC;"></td>

                        <td class="two-col-cell" width="50%" valign="top" style="padding-left: 16px;">
                          <div style="margin-bottom: 14px;">
                            <div style="font-size: 11px; color: #64748B; font-weight: 600; margin-bottom: 2px;">
                              &#127891; Designation
                            </div>
                            <div style="font-size: 13px; color: #172E58; font-weight: 700;">
                              {{designation}}
                            </div>
                          </div>
                          <div>
                            <div style="font-size: 11px; color: #64748B; font-weight: 600; margin-bottom: 2px;">
                              &#128197; Academic Year
                            </div>
                            <div style="font-size: 13px; color: #172E58; font-weight: 700;">
                              {{current_year}}
                            </div>
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Optional Action Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin: 24px 0;">
                <tr>
                  <td align="center">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" style="background-color: #172E58; border-radius: 8px; box-shadow: 0 4px 12px rgba(23, 46, 88, 0.18);">
                          <a href="{{activation_link}}" style="display: inline-block; background-color: #172E58; color: #FFFFFF; font-weight: 700; font-size: 14px; text-decoration: none; padding: 13px 28px; border-radius: 8px;">
                            &#128229;&nbsp; View Admit Card &amp; Schedule &rarr;
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Fallback Link Notice -->
              <div style="background-color: #EEF4FF; border: 1px solid #D0E0FC; border-radius: 8px; padding: 10px 14px; font-size: 11px; color: #475569; text-align: center; margin: 16px 0 24px 0;">
                &#9432; If the button does not work, please copy and open the link below:<br>
                <a href="{{activation_link}}" style="color: #1456AD; font-weight: 600; word-break: break-all;">
                  {{activation_link}}
                </a>
              </div>

              <!-- Sign-Off -->
              <div style="margin-top: 24px; font-size: 13px; line-height: 1.6; color: #1E293B;">
                <p style="margin: 0 0 4px 0; color: #64748B;">Best regards,</p>
                <p style="margin: 0; font-weight: 700; color: #172E58;">SNPSUNEXUS</p>
                <p style="margin: 0; font-size: 12px; color: #64748B;">Your Trusted Education Partner</p>
              </div>
            </td>
          </tr>

          <!-- Footer Section -->
          <tr>
            <td style="background-color: #172E58; border-top: 3px solid #C69A4C; padding: 18px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="left" style="vertical-align: middle;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="vertical-align: middle; padding-right: 8px;">
                          <img src="/assets/snpsunexus-logo.png" alt="SNPSUNEXUS" width="22" height="26" style="display: block; width: 22px; height: 26px; object-fit: contain;" />
                        </td>
                        <td style="border-left: 1px solid rgba(255,255,255,0.3); padding-left: 8px; vertical-align: middle;">
                          <span style="font-size: 13px; font-weight: 700; color: #FFFFFF; letter-spacing: 0.5px;">
                            SNPSUNEXUS
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td align="right" style="vertical-align: middle; font-size: 11px; color: #E2E8F0;">
                    &copy; {{current_year}} SNPSUNEXUS. All rights reserved.
                  </td>
                  <td width="20" align="right" style="vertical-align: top;">
                    <div style="width: 14px; height: 10px; background-color: #C69A4C; transform: skewX(-25deg); border-radius: 1px;"></div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  text_content: `SNPSUNEXUS
EMAIL NOTIFICATION: Official Semester Examination Admit Card & Schedule (v1)

Dear {{recipient_name}},

This is an authenticated notification from {{institution_name}}.
Your official examination admit card and comprehensive schedule for the {{current_year}} academic term have been generated.

Your Details:
- Candidate Name: {{recipient_name}}
- Designation: {{designation}}
- Institution Email: {{recipient_email}}
- Academic Year: {{current_year}}

View Admit Card & Schedule: {{activation_link}}

If the button does not work, please copy and open the link below:
{{activation_link}}

Best regards,
SNPSUNEXUS
Your Trusted Education Partner

© {{current_year}} SNPSUNEXUS. All rights reserved.`,
};
