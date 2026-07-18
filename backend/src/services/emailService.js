const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      }
    });
  }

  getEmailBase(content, previewText = '') {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>KnowBridge Support</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #f4f6f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    .wrapper { max-width: 600px; margin: 0 auto; padding: 32px 16px; }
    .card { background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 32px; text-align: center; }
    .header-logo { color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; }
    .header-logo span { color: #c4b5fd; }
    .header-subtitle { color: #c4b5fd; font-size: 13px; margin-top: 4px; }
    .body { padding: 32px; }
    .alert-banner { background: #fef2f2; border: 1px solid #fecaca; border-left: 4px solid #ef4444; border-radius: 8px; padding: 16px; margin-bottom: 24px; display: flex; align-items: flex-start; gap: 12px; }
    .alert-icon { font-size: 20px; flex-shrink: 0; }
    .alert-text h4 { color: #b91c1c; font-size: 14px; font-weight: 600; margin-bottom: 4px; }
    .alert-text p { color: #dc2626; font-size: 13px; }
    .greeting { color: #111827; font-size: 20px; font-weight: 700; margin-bottom: 8px; }
    .intro { color: #6b7280; font-size: 14px; line-height: 1.6; margin-bottom: 24px; }
    .question-box { background: #f8faff; border: 1px solid #e0e7ff; border-radius: 10px; padding: 20px; margin-bottom: 24px; }
    .question-label { color: #6366f1; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; }
    .question-text { color: #1e1b4b; font-size: 16px; font-weight: 600; line-height: 1.5; }
    .details-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    .details-table tr:nth-child(even) td { background: #f9fafb; }
    .details-table td { padding: 10px 14px; font-size: 13px; border-bottom: 1px solid #f3f4f6; }
    .details-table td:first-child { color: #6b7280; font-weight: 500; width: 130px; white-space: nowrap; }
    .details-table td:last-child { color: #111827; font-weight: 600; }
    .cta-section { text-align: center; margin: 28px 0; }
    .cta-button { display: inline-block; background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 15px; font-weight: 600; letter-spacing: 0.01em; }
    .cta-button:hover { opacity: 0.9; }
    .cta-note { color: #9ca3af; font-size: 12px; margin-top: 10px; }
    .divider { border: none; border-top: 1px solid #f3f4f6; margin: 24px 0; }
    .tips-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin-bottom: 24px; }
    .tips-box h4 { color: #166534; font-size: 13px; font-weight: 600; margin-bottom: 8px; }
    .tips-box ul { color: #15803d; font-size: 13px; padding-left: 16px; }
    .tips-box li { margin-bottom: 4px; }
    .footer { background: #f9fafb; border-top: 1px solid #f3f4f6; padding: 24px 32px; text-align: center; }
    .footer-brand { color: #374151; font-size: 14px; font-weight: 600; margin-bottom: 4px; }
    .footer-links { margin: 12px 0; }
    .footer-links a { color: #6366f1; font-size: 12px; text-decoration: none; margin: 0 8px; }
    .footer-copy { color: #9ca3af; font-size: 11px; margin-top: 12px; }
    .badge { display: inline-block; background: #fef3c7; color: #92400e; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 20px; }
  </style>
</head>
<body>
  <div style="display:none;max-height:0;overflow:hidden;">${previewText}</div>
  <div class="wrapper">
    <div class="card">
      <!-- Header -->
      <div class="header">
        <div class="header-logo">Edu<span>Ctrl</span></div>
        <div class="header-subtitle">Support Notification System</div>
      </div>
      <!-- Body -->
      <div class="body">
        ${content}
      </div>
      <!-- Footer -->
      <div class="footer">
        <div class="footer-brand">KnowBridge CRM</div>
        <div class="footer-links">
          <a href="https://www.KnowBridge.com">Website</a>
          <a href="https://www.KnowBridge.com/knowledgebase">Knowledge Base</a>
          <a href="mailto:info@KnowBridge.com">Contact Support</a>
        </div>
        <div class="footer-copy">
          © ${new Date().getFullYear()} KnowBridge. All rights reserved.<br>
          This is an automated notification from the KnowBridge Support System.
        </div>
      </div>
    </div>
    <p style="text-align:center;color:#9ca3af;font-size:11px;margin-top:16px;">
      You received this because you are a registered support agent on KnowBridge.
    </p>
  </div>
</body>
</html>`;
  }

  async sendEscalationEmail({ agentEmails, userQuestion, chatId, clientDomain, userName, userEmail }) {
    if (process.env.ENABLE_EMAIL_NOTIFICATIONS !== 'true') {
      logger.info('Email notifications disabled - skipping escalation email');
      return;
    }
    if (!agentEmails || agentEmails.length === 0) return;

    const dashboardUrl = process.env.ADMIN_DASHBOARD_URL || 'http://localhost:3000';
    const chatUrl      = `${dashboardUrl}/chats/${chatId}`;
    const timeStr      = new Date().toLocaleString('en-IN', {
      dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata'
    });

    const bodyContent = `
      <div class="alert-banner">
        <div class="alert-icon">🔔</div>
        <div class="alert-text">
          <h4>Human Support Required</h4>
          <p>A user could not be helped by the AI and needs a human agent.</p>
        </div>
      </div>

      <p class="greeting">New Escalation Alert</p>
      <p class="intro">
        A conversation has been automatically escalated because the AI assistant could not
        find a satisfactory answer in the knowledge base. Please review and respond promptly.
      </p>

      <div class="question-box">
        <div class="question-label">💬 User's Question</div>
        <div class="question-text">"${userQuestion}"</div>
      </div>

      <table class="details-table">
        <tr>
          <td>👤 User Name</td>
          <td>${userName || 'Anonymous'}</td>
        </tr>
        <tr>
          <td>📧 User Email</td>
          <td>${userEmail || 'Not provided'}</td>
        </tr>
        <tr>
          <td>🌐 Client Domain</td>
          <td><span class="badge">${clientDomain || 'unknown'}</span></td>
        </tr>
        <tr>
          <td>🕐 Time</td>
          <td>${timeStr}</td>
        </tr>
        <tr>
          <td>🔑 Chat ID</td>
          <td style="font-family:monospace;font-size:11px;color:#6b7280;">${chatId}</td>
        </tr>
      </table>

      <div class="cta-section">
        <a href="${chatUrl}" class="cta-button">
          💬 &nbsp; Open Conversation
        </a>
        <p class="cta-note">Click to view the full conversation and reply directly to the user</p>
      </div>

      <hr class="divider">

      <div class="tips-box">
        <h4>✅ Quick Response Checklist</h4>
        <ul>
          <li>Review the user's question and chat history</li>
          <li>Provide a clear, helpful response</li>
          <li>If resolved, close the chat or mark it as resolved</li>
          <li>Consider adding this answer to the Knowledge Base</li>
        </ul>
      </div>
    `;

    const html = this.getEmailBase(
      bodyContent,
      `Action needed: "${userQuestion.slice(0, 60)}..." — KnowBridge Support`
    );

    try {
      const info = await this.transporter.sendMail({
        from: `"${process.env.EMAIL_FROM_NAME || 'KnowBridge Support'}" <${process.env.SMTP_USER}>`,
        to:   agentEmails.join(', '),
        subject: `🔔 [KnowBridge] Human Support Needed — ${clientDomain || 'Unknown Domain'}`,
        html,
        text: `Human support needed!\n\nUser: ${userName}\nQuestion: "${userQuestion}"\nDomain: ${clientDomain}\n\nOpen chat: ${chatUrl}`
      });
      logger.info(`✅ Escalation email sent to ${agentEmails.length} agent(s): ${info.messageId}`);
    } catch (error) {
      logger.error('Failed to send escalation email:', error.message);
    }
  }

  async sendAssignmentEmail(agentEmail, agentName, userName, chatId) {
    if (process.env.ENABLE_EMAIL_NOTIFICATIONS !== 'true') return;

    const chatUrl = `${process.env.ADMIN_DASHBOARD_URL || 'http://localhost:3000'}/chats/${chatId}`;

    const bodyContent = `
      <p class="greeting">Hi ${agentName || 'Agent'}, 👋</p>
      <p class="intro">
        A new chat has been assigned to you. Please respond to the user as soon as possible.
      </p>
      <table class="details-table">
        <tr><td>👤 User</td><td>${userName || 'Anonymous'}</td></tr>
        <tr><td>🔑 Chat ID</td><td style="font-family:monospace;font-size:11px;">${chatId}</td></tr>
        <tr><td>🕐 Assigned</td><td>${new Date().toLocaleString()}</td></tr>
      </table>
      <div class="cta-section">
        <a href="${chatUrl}" class="cta-button">💬 &nbsp; Open Chat</a>
      </div>
    `;

    try {
      await this.transporter.sendMail({
        from: `"KnowBridge Support" <${process.env.SMTP_USER}>`,
        to:      agentEmail,
        subject: `💬 [KnowBridge] New Chat Assigned — ${userName || 'Anonymous'}`,
        html:    this.getEmailBase(bodyContent, `New chat assigned from ${userName}`)
      });
      logger.info(`✅ Assignment email sent to ${agentEmail}`);
    } catch (error) {
      logger.error('Assignment email error:', error.message);
    }
  }

  async sendTestEmail(toEmail) {
    const body = `
      <p class="greeting">✅ SMTP Test Successful!</p>
      <p class="intro">Your email configuration is working correctly. KnowBridge will now send professional notifications to your team.</p>
      <div class="cta-section">
        <a href="https://www.KnowBridge.com" class="cta-button">Visit KnowBridge</a>
      </div>
    `;
    try {
      await this.transporter.sendMail({
        from:    `"KnowBridge Support" <${process.env.SMTP_USER}>`,
        to:      toEmail,
        subject: '✅ KnowBridge Email Test — SMTP Working!',
        html:    this.getEmailBase(body, 'KnowBridge email is configured correctly')
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = new EmailService();
