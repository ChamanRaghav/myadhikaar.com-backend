// Email templates carried over unchanged from the Base44 sendEmail function.
// Callers pass HTML-escaped data for the body (see MailService.sendTemplate).
/* eslint-disable */

export type TemplateFn = (d: any) => { subject: string; body: string };
export const templates: Record<string, TemplateFn> = {

  // ── USER ──────────────────────────────────────────────────────────────────

  user_welcome: ({ userName }) => ({
    subject: "Welcome to MyAdhikaar – India's Legal Platform",
    body: `<h2>Welcome, ${userName}! 🎉</h2>
<p>Your MyAdhikaar account is ready. Here is what you can do:</p>
<ul>
  <li>⚖️ Talk to a verified advocate instantly via audio or video call</li>
  <li>📋 Register Trademark, GST, or your Company online</li>
  <li>🚦 Check and pay traffic challans</li>
  <li>📁 File and manage your legal cases</li>
</ul>
<p><a class="btn" href="https://myadhikaar.com/UserDashboard" style="background:#FF6B35">Go to Your Dashboard →</a></p>
<p>— Team MyAdhikaar</p>`,
  }),

  wallet_recharge: ({ userName, email, amount, bonus, newBalance, paymentMethod, transactionId }) => ({
    subject: `Wallet Recharged – ₹${amount} Added | MyAdhikaar`,
    body: `<h2>Hello ${userName},</h2>
<p>Your MyAdhikaar wallet has been topped up successfully.</p>
<table>
  <tr><td>Amount Paid</td><td>₹${amount}</td></tr>
  <tr><td>Bonus Credited</td><td>₹${bonus || 0}</td></tr>
  <tr><td>New Balance</td><td><b>₹${newBalance}</b></td></tr>
  <tr><td>Payment Method</td><td>${paymentMethod || 'UPI'}</td></tr>
  ${transactionId ? `<tr><td>Transaction ID</td><td>${transactionId}</td></tr>` : ''}
</table>
<p>Your wallet is ready. Connect with a verified advocate anytime.</p>
<p><a class="btn" href="https://myadhikaar.com/TalkToLawyer" style="background:#FF6B35">Talk to a Lawyer →</a></p>
<p>— Team MyAdhikaar</p>`,
  }),

  admin_wallet_recharge: ({ userName, email, amount, bonus, newBalance, paymentMethod }) => ({
    subject: `[Wallet Recharge] ₹${amount} — ${userName}`,
    body: `<h3>Wallet Recharge Alert</h3>
<table>
  <tr><td>User</td><td>${userName}</td></tr>
  <tr><td>Email</td><td>${email || 'N/A'}</td></tr>
  <tr><td>Amount</td><td>₹${amount}</td></tr>
  <tr><td>Bonus</td><td>₹${bonus || 0}</td></tr>
  <tr><td>New Balance</td><td>₹${newBalance}</td></tr>
  <tr><td>Method</td><td>${paymentMethod || 'UPI'}</td></tr>
</table>`,
  }),

  admin_large_recharge: ({ userName, email, amount, newBalance }) => ({
    subject: `🚨 [Large Recharge Alert] ₹${amount} — ${userName}`,
    body: `<h3 style="color:#ef4444">Large Recharge Detected</h3>
<p>A user recharged more than ₹5,000 in a single transaction. Please review.</p>
<table>
  <tr><td>User</td><td>${userName}</td></tr>
  <tr><td>Email</td><td>${email}</td></tr>
  <tr><td>Amount</td><td><b>₹${amount}</b></td></tr>
  <tr><td>New Balance</td><td>₹${newBalance}</td></tr>
</table>
<p><a href="https://myadhikaar.com/AdminDashboard">Review in Admin Dashboard →</a></p>`,
  }),

  wallet_low_balance: ({ userName, balance, minsLeft }) => ({
    subject: `Low Wallet Balance – ₹${balance} Remaining | MyAdhikaar`,
    body: `<h2>Hello ${userName},</h2>
<p>Your wallet balance is running low. You have approximately <b>${minsLeft || 3} minutes</b> remaining at your current rate.</p>
<p>Add money now to avoid your call being interrupted.</p>
<p><a class="btn" href="https://myadhikaar.com/UserDashboard?tab=wallet" style="background:#FF6B35">Add Money Now →</a></p>
<p>— Team MyAdhikaar</p>`,
  }),

  call_completed_user: ({ userName, userEmail, lawyerName, callType, duration, amountCharged }) => ({
    subject: `Call Summary – ${duration} mins with ${lawyerName} | MyAdhikaar`,
    body: `<h2>Hello ${userName},</h2>
<p>Your consultation is complete. Here is your summary:</p>
<table>
  <tr><td>Advocate</td><td>${lawyerName}</td></tr>
  <tr><td>Type</td><td>${callType || 'Audio Call'}</td></tr>
  <tr><td>Duration</td><td>${duration} minutes</td></tr>
  <tr><td>Amount Charged</td><td>₹${amountCharged}</td></tr>
</table>
<p>We hope your consultation was helpful. You can rate the advocate and continue via chat anytime.</p>
<p><a class="btn" href="https://myadhikaar.com/TalkToLawyer" style="background:#FF6B35">Connect Again →</a></p>
<p>— Team MyAdhikaar</p>`,
  }),

  admin_call_completed: ({ userName, userEmail, lawyerName, callType, duration, amountCharged }) => ({
    subject: `[Call Completed] ${duration} mins — ${userName} with ${lawyerName}`,
    body: `<h3>Call Completed</h3>
<table>
  <tr><td>User</td><td>${userName} (${userEmail || 'N/A'})</td></tr>
  <tr><td>Advocate</td><td>${lawyerName}</td></tr>
  <tr><td>Type</td><td>${callType || 'Audio'}</td></tr>
  <tr><td>Duration</td><td>${duration} mins</td></tr>
  <tr><td>Charged</td><td>₹${amountCharged}</td></tr>
</table>`,
  }),

  call_completed_advocate: ({ advocateName, clientName, callType, duration, amountEarned }) => ({
    subject: `Consultation Completed – ₹${amountEarned} Earned | MyAdhikaar`,
    body: `<h2>Hello ${advocateName},</h2>
<p>Your consultation has been completed.</p>
<table>
  <tr><td>Client</td><td>${clientName}</td></tr>
  <tr><td>Type</td><td>${callType || 'Audio Call'}</td></tr>
  <tr><td>Duration</td><td>${duration} minutes</td></tr>
  <tr><td>Amount Earned</td><td><b>₹${amountEarned}</b></td></tr>
</table>
<p>The amount has been credited to your advocate wallet.</p>
<p><a class="btn" href="https://myadhikaar.com/AdvocateDashboard" style="background:#FF6B35">View Dashboard →</a></p>
<p>— Team MyAdhikaar</p>`,
  }),

  advocate_first_earning: ({ advocateName, amount }) => ({
    subject: `🎉 You just earned your first ₹${amount} on MyAdhikaar!`,
    body: `<h2>Congratulations, ${advocateName}! 🎉</h2>
<p>You just completed your <b>first paid consultation</b> and earned <b>₹${amount}</b>!</p>
<p>Stay online during peak hours (10AM–2PM and 7PM–10PM) to get more clients.</p>
<ul>
  <li>✅ Keep your profile photo and bio updated</li>
  <li>✅ Toggle Online status when available</li>
  <li>✅ Respond quickly to incoming requests</li>
</ul>
<p><a class="btn" href="https://myadhikaar.com/AdvocateDashboard" style="background:#FF6B35">View Dashboard →</a></p>
<p>— Team MyAdhikaar</p>`,
  }),

  advocate_incoming_call: ({ advocateName, clientName, callType, notes }) => ({
    subject: `Incoming ${callType || 'Audio'} Call — ${clientName} | MyAdhikaar`,
    body: `<h2>Hello ${advocateName},</h2>
<p>You have a new consultation request waiting.</p>
<table>
  <tr><td>Client</td><td>${clientName}</td></tr>
  <tr><td>Type</td><td>${callType || 'Audio Call'}</td></tr>
  ${notes ? `<tr><td>Notes</td><td>${notes}</td></tr>` : ''}
</table>
<p>⚠️ Please log in to accept. <b>This request expires in 5 minutes.</b></p>
<p><a class="btn" href="https://myadhikaar.com/AdvocateDashboard?tab=calls" style="background:#FF6B35">Accept Call →</a></p>
<p>— Team MyAdhikaar</p>`,
  }),

  advocate_monthly_summary: ({ advocateName, month, totalCalls, totalMinutes, totalEarned, avgRating }) => ({
    subject: `Your ${month} Summary — ${totalCalls} calls, ₹${totalEarned} earned | MyAdhikaar`,
    body: `<h2>Hello ${advocateName},</h2>
<p>Here is your performance summary for <b>${month}</b>.</p>
<table>
  <tr><td>Total Calls</td><td>${totalCalls}</td></tr>
  <tr><td>Total Minutes</td><td>${totalMinutes} mins</td></tr>
  <tr><td>Total Earned</td><td><b>₹${totalEarned}</b></td></tr>
  <tr><td>Average Rating</td><td>${avgRating ? `${avgRating} / 5` : 'N/A'}</td></tr>
</table>
<p>Keep your profile complete and stay online during peak hours.</p>
<p><a class="btn" href="https://myadhikaar.com/AdvocateDashboard" style="background:#FF6B35">View Full Stats →</a></p>
<p>— Team MyAdhikaar</p>`,
  }),

  admin_daily_report: ({ date, totalCalls, totalRevenue, newUsers, newAdvocateApps, openDisputes }) => ({
    subject: `Daily Report — ${date} | MyAdhikaar`,
    body: `<h2>Good morning! Here is yesterday's platform summary.</h2>
<table>
  <tr><td>Date</td><td>${date}</td></tr>
  <tr><td>Total Calls</td><td>${totalCalls}</td></tr>
  <tr><td>Total Revenue</td><td>₹${totalRevenue}</td></tr>
  <tr><td>New Users</td><td>${newUsers}</td></tr>
  <tr><td>New Advocate Apps</td><td>${newAdvocateApps}</td></tr>
  <tr><td>Open Disputes</td><td>${openDisputes}</td></tr>
</table>
<p><a href="https://myadhikaar.com/AdminDashboard">Go to Admin Dashboard →</a></p>`,
  }),

  dispute_raised_user: ({ userName, email, disputeType, description, amount }) => ({
    subject: "Dispute Raised – Under Review | MyAdhikaar",
    body: `<h2>Hello ${userName},</h2>
<p>Your dispute has been <b>successfully raised</b> and is now under review.</p>
<table>
  <tr><td>Issue Type</td><td>${disputeType}</td></tr>
  ${amount ? `<tr><td>Amount</td><td>₹${amount}</td></tr>` : ""}
</table>
<p>Our team will review within <b>2–3 business days</b> and update you via email.</p>
<p>— Team MyAdhikaar</p>`,
  }),

  // adminCopy on dispute_raised_user strips 'user_' → looks for admin_dispute_raised_user
  admin_dispute_raised_user: ({ userName, email, disputeType, description, amount }) => ({
    subject: `[New Dispute] ${disputeType} — ${userName}`,
    body: `<h3>New Dispute Raised</h3>
<table>
  <tr><td>User</td><td>${userName}</td></tr>
  <tr><td>Email</td><td>${email || 'N/A'}</td></tr>
  <tr><td>Type</td><td>${disputeType}</td></tr>
  ${amount ? `<tr><td>Amount</td><td>₹${amount}</td></tr>` : ""}
</table>
<p><b>Description:</b> ${description || 'N/A'}</p>
<p><a href="https://myadhikaar.com/AdminDashboard">Review in Admin Dashboard →</a></p>`,
  }),

  // Kept for backward compat (direct calls from DisputeSection.jsx)
  admin_dispute_raised: ({ userName, email, disputeType, description, amount }) => ({
    subject: `[New Dispute] ${disputeType} — ${userName}`,
    body: `<h3>New Dispute Raised</h3>
<table>
  <tr><td>User</td><td>${userName}</td></tr>
  <tr><td>Email</td><td>${email || 'N/A'}</td></tr>
  <tr><td>Type</td><td>${disputeType}</td></tr>
  ${amount ? `<tr><td>Amount</td><td>₹${amount}</td></tr>` : ""}
</table>
<p><b>Description:</b> ${description || 'N/A'}</p>
<p><a href="https://myadhikaar.com/AdminDashboard">Review in Admin Dashboard →</a></p>`,
  }),

  dispute_status_update: ({ userName, status, adminNote, refundAmount }) => ({
    subject: `Dispute Update — ${status} | MyAdhikaar`,
    body: `<h2>Hello ${userName},</h2>
<p>Your dispute has been reviewed and marked as:
  <b style="color:${status === 'Resolved' ? '#10B981' : status === 'Rejected' ? '#EF4444' : '#3B82F6'}">${status}</b>
</p>
${adminNote ? `<p><b>Admin Note:</b> ${adminNote}</p>` : ""}
${refundAmount ? `<p>A refund of <b>₹${refundAmount}</b> has been processed to your wallet. It will reflect within a few minutes.</p>` : ""}
<p>— Team MyAdhikaar</p>`,
  }),

  user_refund: ({ userName, amount, reason }) => ({
    subject: `Refund Processed – ₹${amount} | MyAdhikaar`,
    body: `<h2>Hello ${userName},</h2>
<p>A refund of <b>₹${amount}</b> has been processed to your MyAdhikaar wallet.</p>
${reason ? `<p><b>Reason:</b> ${reason}</p>` : ""}
<p>The amount will reflect in your wallet within a few minutes.</p>
<p>— Team MyAdhikaar</p>`,
  }),

  // adminCopy on user_refund strips 'user_' → looks for admin_refund
  admin_refund: ({ userName, email, amount, reason }) => ({
    subject: `[Refund Processed] ₹${amount} — ${userName}`,
    body: `<h3>Refund Processed</h3>
<table>
  <tr><td>User</td><td>${userName}</td></tr>
  <tr><td>Email</td><td>${email || 'N/A'}</td></tr>
  <tr><td>Amount</td><td>₹${amount}</td></tr>
  ${reason ? `<tr><td>Reason</td><td>${reason}</td></tr>` : ''}
</table>`,
  }),

  payout_processed: ({ advocateName, amount, netAmount, commission }) => ({
    subject: `Payout Processed – ₹${netAmount} | MyAdhikaar`,
    body: `<h2>Hello ${advocateName},</h2>
<p>Your payout has been <b>processed successfully</b>.</p>
<table>
  <tr><td>Gross Earnings</td><td>₹${amount}</td></tr>
  <tr><td>Platform Commission (20%)</td><td>-₹${commission}</td></tr>
  <tr><td>Net Payout</td><td><b>₹${netAmount}</b></td></tr>
</table>
<p>Amount will be credited to your bank account within 1–2 business days.</p>
<p>— Team MyAdhikaar</p>`,
  }),

  advocate_application_received: ({ userName, barCouncilNo, jurisdiction, city, state }) => ({
    subject: "Application Received – MyAdhikaar Advocate Registration",
    body: `<h2>Dear ${userName},</h2>
<p>Thank you for applying to join <b>MyAdhikaar</b> as a verified advocate. We have received your application:</p>
<table>
  <tr><td>Bar Council No.</td><td>${barCouncilNo}</td></tr>
  <tr><td>Practice Area</td><td>${jurisdiction}</td></tr>
  <tr><td>City</td><td>${city}, ${state}</td></tr>
</table>
<p>Our team will verify your documents. <b>Expected approval: 24–48 hours.</b></p>
<p>— Team MyAdhikaar</p>`,
  }),

  admin_new_advocate_application: ({ name, email, phone, barCouncilNo, barAssociation, jurisdiction, experience, city, state, rate }) => ({
    subject: `[New Advocate Application] ${name}`,
    body: `<h2>New Advocate Application</h2>
<table>
  <tr><td>Name</td><td>${name}</td></tr>
  <tr><td>Email</td><td>${email}</td></tr>
  <tr><td>Phone</td><td>${phone}</td></tr>
  <tr><td>Bar Council No.</td><td>${barCouncilNo}</td></tr>
  <tr><td>Bar Association</td><td>${barAssociation}</td></tr>
  <tr><td>Jurisdiction</td><td>${jurisdiction}</td></tr>
  <tr><td>Experience</td><td>${experience}</td></tr>
  <tr><td>City</td><td>${city}, ${state}</td></tr>
  <tr><td>Rate</td><td>₹${rate}/30min</td></tr>
</table>
<p><a href="https://myadhikaar.com/LawyerManagement">Review in Lawyer Management →</a></p>`,
  }),

  advocate_application_approved: ({ userName }) => ({
    subject: "🎉 Your Advocate Account is Approved! | MyAdhikaar",
    body: `<h2>Congratulations, ${userName}!</h2>
<p>Your advocate profile has been <b>verified and activated</b> on MyAdhikaar.</p>
<ul>
  <li>✅ Receive instant consultation requests</li>
  <li>📞 Conduct audio and video calls</li>
  <li>💰 Earn from every minute of consultation</li>
</ul>
<p>Log in → toggle <b>Online</b> → complete your profile to start receiving clients.</p>
<p>Welcome to the MyAdhikaar family!</p>
<p><a class="btn" href="https://myadhikaar.com/AdvocateDashboard" style="background:#10B981">Go to Dashboard →</a></p>
<p>— Team MyAdhikaar</p>`,
  }),

  advocate_rejected: (d) => templates.advocate_application_rejected(d),

  advocate_application_rejected: ({ userName, reason }) => ({
    subject: "Advocate Application Update – MyAdhikaar",
    body: `<h2>Hello ${userName},</h2>
<p>We regret to inform you that your advocate application could not be approved at this time.</p>
<p><b>Reason:</b> ${reason || "Your Bar Council ID document was not clearly readable. Please resubmit with a clear scan or photo."}</p>
<p>You are welcome to reapply with updated documents. Contact us at <a href="mailto:support@myadhikaar.com">support@myadhikaar.com</a>.</p>
<p>— Team MyAdhikaar</p>`,
  }),

  consultation_reminder: ({ userName, lawyerName, scheduledTime, minutesBefore }) => ({
    subject: `Reminder — Your consultation is in ${minutesBefore || 30} minutes | MyAdhikaar`,
    body: `<h2>Hello ${userName},</h2>
<p>Your consultation with <b>${lawyerName}</b> is starting in <b>${minutesBefore || 30} minutes</b>.</p>
<table>
  <tr><td>Scheduled Time</td><td>${scheduledTime}</td></tr>
</table>
<p>Please be in a quiet place with a good internet connection.</p>
<p><a class="btn" href="https://myadhikaar.com/TalkToLawyer" style="background:#3B82F6">Join Now →</a></p>
<p>— Team MyAdhikaar</p>`,
  }),

  user_service_request: ({ userName, service }) => ({
    subject: `Service Request Received – ${service}`,
    body: `<h2>Hello ${userName},</h2>
<p>We have received your request for <b>${service}</b>.</p>
<p>Our team will review and get in touch within 24 hours.</p>
<p>— Team MyAdhikaar</p>`,
  }),

  admin_service_request: ({ userName, email, service, description }) => ({
    subject: `[New Service Request] ${service} — ${userName}`,
    body: `<h3>New Service Request</h3>
<table>
  <tr><td>Client</td><td>${userName}</td></tr>
  <tr><td>Email</td><td>${email}</td></tr>
  <tr><td>Service</td><td>${service}</td></tr>
</table>
<p><b>Description:</b> ${description}</p>
<p>Review in Admin Dashboard → Service Requests.</p>`,
  }),

  service_order_bill: ({ userName, serviceName, srNo, orderId, baseAmount, discount, promoCode, finalAmount, orderDate }) => ({
    subject: `Order Confirmed – ${serviceName} | MyAdhikaar`,
    body: `<h2>Hello ${userName},</h2>
<p>Thank you for choosing <b>MyAdhikaar</b>! Your service order has been received and payment is being processed.</p>

<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin:16px 0">
  <p style="font-size:13px;color:#64748b;margin:0 0 4px 0">SERVICE ORDER</p>
  <p style="font-size:20px;font-weight:900;color:#0d1f3c;margin:0">${serviceName}</p>
  <p style="font-size:12px;color:#94a3b8;margin:4px 0 0 0">Order ID: ${srNo}</p>
</div>

<table style="width:100%;border-collapse:collapse;margin:12px 0">
  <tr><td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:bold;background:#f9fafb;width:160px">Order Date</td><td style="padding:8px 12px;border:1px solid #e5e7eb">${orderDate}</td></tr>
  <tr><td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:bold;background:#f9fafb">Service Ref No.</td><td style="padding:8px 12px;border:1px solid #e5e7eb">${srNo}</td></tr>
  <tr><td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:bold;background:#f9fafb">Service Price</td><td style="padding:8px 12px;border:1px solid #e5e7eb">₹${baseAmount}</td></tr>
  ${discount > 0 ? `<tr><td style="padding:8px 12px;border:1px solid #e5e7eb;font-weight:bold;background:#f9fafb;color:#16a34a">Discount${promoCode ? ` (${promoCode})` : ''}</td><td style="padding:8px 12px;border:1px solid #e5e7eb;color:#16a34a;font-weight:bold">– ₹${discount}</td></tr>` : ''}
  <tr style="background:#fff7ed"><td style="padding:10px 12px;border:2px solid #fed7aa;font-weight:900;color:#c2410c">Amount Paid</td><td style="padding:10px 12px;border:2px solid #fed7aa;font-weight:900;color:#ea580c;font-size:16px">₹${finalAmount}</td></tr>
</table>

<p style="font-size:13px;color:#475569;margin:12px 0"><b>What happens next?</b></p>
<ol style="font-size:13px;color:#475569;padding-left:18px;line-height:1.8">
  <li>Our team will review your order within <b>24 hours</b></li>
  <li>You may be asked to upload supporting documents</li>
  <li>A dedicated expert will be assigned to your case</li>
  <li>You will receive progress updates via email</li>
</ol>

<p style="margin-top:16px"><a class="btn" href="https://myadhikaar.com/service-order-success?order_id=${orderId}&sr=${srNo}&service=${encodeURIComponent(serviceName)}&amount=${finalAmount}&email=${encodeURIComponent(userName)}" style="background:#FF6B35">View Order Status →</a></p>

<p style="font-size:12px;color:#94a3b8;margin-top:16px">For any queries, contact us at <a href="mailto:support@myadhikaar.com">support@myadhikaar.com</a> or call <b>+91 8307749147</b></p>
<p>— Team MyAdhikaar</p>`,
  }),

  admin_service_order_bill: ({ userName, serviceName, srNo, baseAmount, discount, promoCode, finalAmount, orderDate }) => ({
    subject: `[New Order] ${serviceName} — ${userName} — ₹${finalAmount}`,
    body: `<h3>New Legal Service Order</h3>
<table>
  <tr><td>Client</td><td>${userName}</td></tr>
  <tr><td>Service</td><td>${serviceName}</td></tr>
  <tr><td>SR No.</td><td>${srNo}</td></tr>
  <tr><td>Date</td><td>${orderDate}</td></tr>
  <tr><td>Base Price</td><td>₹${baseAmount}</td></tr>
  ${discount > 0 ? `<tr><td>Discount${promoCode ? ` (${promoCode})` : ''}</td><td style="color:#16a34a">–₹${discount}</td></tr>` : ''}
  <tr><td><b>Amount Paid</b></td><td><b>₹${finalAmount}</b></td></tr>
</table>
<p><a href="https://myadhikaar.com/AdminDashboard">Review in Admin Dashboard →</a></p>`,
  }),

  // ── SERVICE PAYMENT SUCCESS ───────────────────────────────────────────────────
  service_payment_success: ({ userName, serviceName, srNo, orderId, amount, paymentMethod, paymentTime, orderDate }) => ({
    subject: `✅ Payment Confirmed – ${serviceName} | MyAdhikaar`,
    body: `
<div style="background:#f0fdf4;border:2px solid #86efac;border-radius:10px;padding:16px 20px;margin-bottom:20px;text-align:center">
  <p style="font-size:28px;margin:0 0 4px 0">✅</p>
  <p style="font-size:18px;font-weight:900;color:#16a34a;margin:0">Payment Confirmed by Cashfree</p>
  <p style="font-size:12px;color:#15803d;margin:4px 0 0 0">Your payment has been verified and your service order is confirmed.</p>
</div>

<h2 style="color:#0d1f3c;margin-top:0">Hello ${userName},</h2>
<p style="color:#475569">Thank you for choosing <b>MyAdhikaar</b>! Here is your payment receipt and invoice.</p>

<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;margin:16px 0">
  <p style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 6px 0">TAX INVOICE</p>
  <p style="font-size:22px;font-weight:900;color:#0d1f3c;margin:0 0 2px 0">${serviceName}</p>
  <p style="font-size:12px;color:#94a3b8;margin:0">SR No: <b style="color:#0d1f3c">${srNo}</b></p>
</div>

<table style="width:100%;border-collapse:collapse;margin:12px 0">
  <tr><td style="padding:9px 12px;border:1px solid #e5e7eb;font-weight:bold;background:#f9fafb;width:160px;font-size:13px">Order Date</td><td style="padding:9px 12px;border:1px solid #e5e7eb;font-size:13px">${orderDate}</td></tr>
  <tr><td style="padding:9px 12px;border:1px solid #e5e7eb;font-weight:bold;background:#f9fafb;font-size:13px">Service Ref No.</td><td style="padding:9px 12px;border:1px solid #e5e7eb;font-size:13px">${srNo}</td></tr>
  <tr><td style="padding:9px 12px;border:1px solid #e5e7eb;font-weight:bold;background:#f9fafb;font-size:13px">Payment Method</td><td style="padding:9px 12px;border:1px solid #e5e7eb;font-size:13px">${paymentMethod || "Online"}</td></tr>
  <tr><td style="padding:9px 12px;border:1px solid #e5e7eb;font-weight:bold;background:#f9fafb;font-size:13px">Payment Time</td><td style="padding:9px 12px;border:1px solid #e5e7eb;font-size:13px">${paymentTime}</td></tr>
  <tr style="background:#fff7ed"><td style="padding:12px;border:2px solid #fed7aa;font-weight:900;color:#c2410c;font-size:14px">Amount Paid</td><td style="padding:12px;border:2px solid #fed7aa;font-weight:900;color:#ea580c;font-size:20px">₹${amount}</td></tr>
</table>

<p style="font-size:13px;color:#475569;font-weight:600;margin-top:16px">What happens next?</p>
<ol style="font-size:13px;color:#475569;padding-left:18px;line-height:2">
  <li>Upload required documents via your order page</li>
  <li>Our experts will review your documents within <b>24 hours</b></li>
  <li>A dedicated expert will be assigned to your case</li>
  <li>You will receive regular progress updates</li>
</ol>

<p style="margin-top:20px"><a class="btn" href="https://myadhikaar.com/service-order-success?order_id=${orderId}&sr=${srNo}&service=${encodeURIComponent(serviceName)}&amount=${amount}&email=${encodeURIComponent(userName)}" style="background:#16a34a">View Order & Upload Documents →</a></p>
<p style="font-size:12px;color:#94a3b8;margin-top:16px">For support: <a href="mailto:support@myadhikaar.com">support@myadhikaar.com</a> | <b>+91 8307749147</b></p>
<p>— Team MyAdhikaar</p>`,
  }),

  admin_service_payment_success: ({ userName, serviceName, srNo, orderId, amount, paymentMethod, paymentTime, orderDate }) => ({
    subject: `[Payment Confirmed] ${serviceName} — ${userName} — ₹${amount}`,
    body: `<h3 style="color:#16a34a">✅ Payment Confirmed by Cashfree</h3>
<table>
  <tr><td>Client</td><td>${userName}</td></tr>
  <tr><td>Service</td><td>${serviceName}</td></tr>
  <tr><td>SR No.</td><td>${srNo}</td></tr>
  <tr><td>Order ID</td><td>${orderId}</td></tr>
  <tr><td>Date</td><td>${orderDate}</td></tr>
  <tr><td>Payment Method</td><td>${paymentMethod || "Online"}</td></tr>
  <tr><td>Payment Time</td><td>${paymentTime}</td></tr>
  <tr><td><b>Amount Paid</b></td><td><b style="color:#ea580c">₹${amount}</b></td></tr>
</table>
<p><a href="https://myadhikaar.com/AdminDashboard">Review in Admin Dashboard →</a></p>`,
  }),

  // ── SERVICE PAYMENT FAILED ────────────────────────────────────────────────────
  service_payment_failed: ({ userName, serviceName, srNo, orderId, amount, failureReason, orderDate }) => ({
    subject: `❌ Payment Failed – ${serviceName} | MyAdhikaar`,
    body: `
<div style="background:#fef2f2;border:2px solid #fca5a5;border-radius:10px;padding:16px 20px;margin-bottom:20px;text-align:center">
  <p style="font-size:28px;margin:0 0 4px 0">❌</p>
  <p style="font-size:18px;font-weight:900;color:#dc2626;margin:0">Payment Not Completed</p>
  <p style="font-size:12px;color:#b91c1c;margin:4px 0 0 0">Your payment could not be verified by Cashfree.</p>
</div>

<h2 style="color:#0d1f3c;margin-top:0">Hello ${userName},</h2>
<p style="color:#475569">We regret to inform you that your payment for <b>${serviceName}</b> could not be completed or verified.</p>

<table style="width:100%;border-collapse:collapse;margin:12px 0">
  <tr><td style="padding:9px 12px;border:1px solid #e5e7eb;font-weight:bold;background:#f9fafb;width:160px;font-size:13px">Service</td><td style="padding:9px 12px;border:1px solid #e5e7eb;font-size:13px">${serviceName}</td></tr>
  <tr><td style="padding:9px 12px;border:1px solid #e5e7eb;font-weight:bold;background:#f9fafb;font-size:13px">Order ID</td><td style="padding:9px 12px;border:1px solid #e5e7eb;font-size:13px;font-family:monospace">${orderId}</td></tr>
  <tr><td style="padding:9px 12px;border:1px solid #e5e7eb;font-weight:bold;background:#f9fafb;font-size:13px">Date</td><td style="padding:9px 12px;border:1px solid #e5e7eb;font-size:13px">${orderDate}</td></tr>
  <tr style="background:#fef2f2"><td style="padding:9px 12px;border:1px solid #fca5a5;font-weight:bold;color:#dc2626;font-size:13px">Failure Reason</td><td style="padding:9px 12px;border:1px solid #fca5a5;color:#dc2626;font-size:13px">${failureReason || "Payment not confirmed by gateway"}</td></tr>
</table>

<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:14px;margin:16px 0">
  <p style="font-size:13px;font-weight:700;color:#0369a1;margin:0 0 8px 0">Important Information</p>
  <ul style="font-size:12px;color:#475569;padding-left:16px;margin:0;line-height:2">
    <li>No amount has been deducted from your account</li>
    <li>If any amount was debited, it will be <b>auto-refunded within 5–7 business days</b></li>
    <li>Your service request has NOT been created</li>
  </ul>
</div>

<p style="margin-top:20px"><a class="btn" href="https://myadhikaar.com/LegalServices" style="background:#FF6B35">Try Again →</a></p>
<p style="font-size:12px;color:#94a3b8;margin-top:16px">Need help? <a href="mailto:support@myadhikaar.com">support@myadhikaar.com</a> | <b>+91 8307749147</b></p>
<p>— Team MyAdhikaar</p>`,
  }),

  // ── ROADGUARD LEGAL — RGL Advocate Flow ──────────────────────────────────────

  rgl_advocate_approved: ({ advocateName, zone, joinDate }) => ({
    subject: "✅ Approved as RoadGuard Legal (RGL) Advocate | MyAdhikaar",
    body: `<h2>Congratulations, ${advocateName}!</h2>
<p>You have been approved as a <b>RoadGuard Legal (RGL) Advocate</b> on MyAdhikaar.</p>
<table>
  <tr><td>Zone</td><td>${zone}</td></tr>
  <tr><td>Effective From</td><td>${joinDate}</td></tr>
</table>
<p><b>Your milestone fees:</b></p>
<ul>
  <li>🚗 M1 Arrival (Day Shift): ₹2,000</li>
  <li>🌙 M1 Arrival (Night Shift): ₹2,500</li>
  <li>⚖️ M2 Bail/Release: ₹6,000</li>
  <li>✅ M3 Retention (Day 16): ₹2,000</li>
  <li>🏛️ MACT Hearing: ₹500/appearance</li>
</ul>
<p>Please read the Associate Advocate Engagement Agreement (v3) carefully. The 20-minute response target is mandatory.</p>
<p><a class="btn" href="https://myadhikaar.com/RGLDashboard" style="background:#3b82f6">Open RGL Dashboard →</a></p>
<p>— Team MyAdhikaar / RoadGuard Legal</p>`,
  }),

  rgl_case_submitted: ({ caseNumber, clientName, caseType, location }) => ({
    subject: `[RGL] New Case Submitted — ${caseNumber}`,
    body: `<h3>New RGL Case Created</h3>
<table>
  <tr><td>Case No.</td><td>${caseNumber}</td></tr>
  <tr><td>Client</td><td>${clientName}</td></tr>
  <tr><td>Type</td><td>${caseType?.replace(/_/g, ' ')}</td></tr>
  <tr><td>Location</td><td>${location}</td></tr>
</table>
<p><a href="https://myadhikaar.com/RGLDashboard">Dispatch in RGL Dashboard →</a></p>`,
  }),

  rgl_case_assigned: ({ advocateName, caseNumber, clientName, location, caseType }) => ({
    subject: `⚡ New RGL Case Assigned — ${caseNumber} | MyAdhikaar`,
    body: `<h2>Hello ${advocateName},</h2>
<p>A <b>RoadGuard Legal case</b> has been assigned to you. Please respond within <b>20 minutes</b>.</p>
<table>
  <tr><td>Case No.</td><td><b>${caseNumber}</b></td></tr>
  <tr><td>Client</td><td>${clientName}</td></tr>
  <tr><td>Type</td><td>${caseType?.replace(/_/g, ' ')}</td></tr>
  <tr><td>Location</td><td>${location}</td></tr>
  <tr><td>M1 Fee</td><td>₹2,000 (Day) / ₹2,500 (Night)</td></tr>
</table>
<p style="color:#ef4444"><b>⏱️ Response target: 20 minutes. Failure to respond may count as a strike.</b></p>
<p><a class="btn" href="https://myadhikaar.com/RGLDashboard" style="background:#3b82f6">Open RGL Dashboard →</a></p>
<p>— Team MyAdhikaar</p>`,
  }),

  rgl_case_dispatched_admin: ({ advocateName, caseNumber, clientName, location }) => ({
    subject: `[RGL Dispatched] ${caseNumber} → ${advocateName}`,
    body: `<h3>Case Dispatched</h3>
<table>
  <tr><td>Case</td><td>${caseNumber}</td></tr>
  <tr><td>Client</td><td>${clientName}</td></tr>
  <tr><td>Location</td><td>${location}</td></tr>
  <tr><td>Assigned To</td><td>${advocateName}</td></tr>
</table>`,
  }),

  rgl_advocate_applied: ({ advocateName, email, zone }) => ({
    subject: `[New RGL Application] ${advocateName}`,
    body: `<h3>New RGL Advocate Application</h3>
<table>
  <tr><td>Name</td><td>${advocateName}</td></tr>
  <tr><td>Email</td><td>${email}</td></tr>
  <tr><td>Zone</td><td>${zone || 'Not specified'}</td></tr>
</table>
<p><a href="https://myadhikaar.com/RGLDashboard">Approve in RGL Dashboard →</a></p>`,
  }),

  // ── ROADGUARD LEGAL ─────────────────────────────────────────────────────────

  roadguard_enquiry_user: ({ name, phone, email, fleet_size, vehicle_type, selectedPlan, message }) => ({
    subject: "RoadGuard Legal – Enquiry Received | MyAdhikaar",
    body: `<h2>Hello ${name},</h2>
<p>Thank you for your interest in <b>RoadGuard Legal</b> — India's first dedicated legal protection scheme for fleet operators.</p>
<p>We have received your enquiry and our team will contact you within <b>2 hours</b>.</p>
<table>
  <tr><td>Name</td><td>${name}</td></tr>
  <tr><td>Phone</td><td>${phone}</td></tr>
  ${fleet_size ? `<tr><td>Fleet Size</td><td>${fleet_size} vehicles</td></tr>` : ''}
  ${vehicle_type ? `<tr><td>Vehicle Type</td><td>${vehicle_type}</td></tr>` : ''}
  ${selectedPlan ? `<tr><td>Interested Plan</td><td>${selectedPlan}</td></tr>` : ''}
</table>
${message ? `<p><b>Your message:</b> ${message}</p>` : ''}
<p>In the meantime, save our 24/7 helpline in your drivers' phones: <b>+91 8307749147</b></p>
<p><a class="btn" href="https://myadhikaar.com/RoadGuardLegal" style="background:#FF6B35">View RoadGuard Legal Plans →</a></p>
<p>— Team MyAdhikaar / RoadGuard Legal</p>`,
  }),

  career_application_received: ({ name, jobTitle, department }) => ({
    subject: `Application Received – ${jobTitle} | MyAdhikaar`,
    body: `<h2>Dear ${name},</h2>
<p>Thank you for applying for the <b>${jobTitle}</b> position at MyAdhikaar!</p>
<table>
  <tr><td>Position</td><td>${jobTitle}</td></tr>
  <tr><td>Department</td><td>${department}</td></tr>
</table>
<p>We have received your application and our HR team will review it within <b>3–5 business days</b>.</p>
<p>We will get back to you via email if your profile matches our requirements.</p>
<p>Best of luck! — Team MyAdhikaar</p>`,
  }),

  career_application_admin: ({ applicantName, applicantEmail, applicantPhone, jobTitle, department, coverLetter, customAnswers, resumeUrl }) => ({
    subject: `[New Job Application] ${jobTitle} — ${applicantName}`,
    body: `<h3>New Career Application</h3>
<table>
  <tr><td>Applicant</td><td>${applicantName}</td></tr>
  <tr><td>Email</td><td>${applicantEmail}</td></tr>
  <tr><td>Phone</td><td>${applicantPhone || 'N/A'}</td></tr>
  <tr><td>Position</td><td>${jobTitle}</td></tr>
  <tr><td>Department</td><td>${department}</td></tr>
  ${resumeUrl ? `<tr><td>Resume</td><td><a href="${resumeUrl}">View Resume</a></td></tr>` : ''}
</table>
${coverLetter ? `<p><b>Cover Letter:</b><br/>${coverLetter}</p>` : ''}
${customAnswers && customAnswers !== '{}' ? `<p><b>Custom Answers:</b><br/><pre>${customAnswers}</pre></p>` : ''}
<p><a href="https://myadhikaar.com/AdminDashboard">Review in Admin Dashboard → Careers</a></p>`,
  }),

  roadguard_enquiry_admin: ({ name, phone, email, fleet_size, vehicle_type, selectedPlan, message }) => ({
    subject: `[RoadGuard Enquiry] ${name} — ${fleet_size || '?'} vehicles`,
    body: `<h3>New RoadGuard Legal Enquiry</h3>
<table>
  <tr><td>Name</td><td>${name}</td></tr>
  <tr><td>Phone</td><td>${phone}</td></tr>
  <tr><td>Email</td><td>${email}</td></tr>
  <tr><td>Fleet Size</td><td>${fleet_size || 'Not specified'}</td></tr>
  <tr><td>Vehicle Type</td><td>${vehicle_type || 'Not specified'}</td></tr>
  <tr><td>Interested Plan</td><td>${selectedPlan || 'Not selected'}</td></tr>
</table>
${message ? `<p><b>Message:</b> ${message}</p>` : ''}
<p><b>Call back within 2 hours.</b></p>`,
  }),
};

// ── Login code (new) ─────────────────────────────────────────────────────────
templates.login_code = ({ code }) => ({
  subject: `${code} is your MyAdhikaar login code`,
  body: `<h2>Your login code</h2>
<p style="font-size:32px;font-weight:bold;letter-spacing:6px;margin:16px 0">${code}</p>
<p>Enter this code to sign in. It expires in 10 minutes.</p>
<p style="color:#9ca3af;font-size:13px">If you didn't try to sign in, you can ignore this email.</p>`,
});

// ── RoadGuard subscription (new) ─────────────────────────────────────────────
templates.rgl_subscription_confirmed = ({ name, policyNumber, planName, fleetSize, amount, activationDate, expiryDate, invoiceNumber, taxableAmount, gstAmount }) => ({
  subject: `🛡️ RoadGuard Legal — Payment Confirmed: ${planName}`,
  body: `<h2>Dear ${name},</h2>
<p>Your RoadGuard Legal subscription is confirmed.</p>
<table>
  <tr><td>Policy number</td><td>${policyNumber}</td></tr>
  <tr><td>Plan</td><td>${planName}</td></tr>
  <tr><td>Vehicles</td><td>${fleetSize}</td></tr>
  <tr><td>Invoice</td><td>${invoiceNumber}</td></tr>
  <tr><td>Amount (excl. GST)</td><td>₹${taxableAmount}</td></tr>
  <tr><td>GST (18%)</td><td>₹${gstAmount}</td></tr>
  <tr><td>Total paid</td><td>₹${amount}</td></tr>
  <tr><td>Active from</td><td>${activationDate}</td></tr>
  <tr><td>Valid until</td><td>${expiryDate}</td></tr>
</table>
<p>For emergency legal help call <b>+91 8266820000</b> (24/7).</p>
<p>— Team MyAdhikaar</p>`,
});

templates.admin_rgl_subscription_confirmed = ({ name, email, phone, planName, fleetSize, vehicleType, months, amount, gstAmount, policyNumber, invoiceNumber, vehicles }) => ({
  subject: `[RoadGuard] New subscription ${policyNumber}`,
  body: `<h2>New RoadGuard subscription</h2>
<table>
  <tr><td>Buyer</td><td>${name} (${email}, ${phone})</td></tr>
  <tr><td>Plan</td><td>${planName} · ${fleetSize} ${vehicleType} vehicle(s) · ${months} month(s)</td></tr>
  <tr><td>Paid</td><td>₹${amount} (incl. ₹${gstAmount} GST)</td></tr>
  <tr><td>Policy</td><td>${policyNumber}</td></tr>
  <tr><td>Invoice</td><td>${invoiceNumber}</td></tr>
</table>
<p>${(vehicles || []).join('<br>')}</p>`,
});

export function wrapHtml(htmlBody: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body{font-family:Arial,sans-serif;color:#333;background:#f9f9f9;margin:0;padding:0}
  .container{max-width:600px;margin:30px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)}
  .header{background:linear-gradient(135deg,#0d1f3c,#1a3a6b);padding:24px 32px}
  .header h1{color:white;margin:0;font-size:22px}
  .header span{color:#FF6B35}
  .content{padding:28px 32px;font-size:15px;line-height:1.7}
  .footer{background:#f3f4f6;padding:16px 32px;text-align:center;font-size:12px;color:#9ca3af}
  table{border-collapse:collapse;width:100%;margin:12px 0}
  td{padding:8px 12px;border:1px solid #e5e7eb;font-size:14px}
  td:first-child{font-weight:bold;background:#f9fafb;width:140px}
  a{color:#FF6B35}
  .btn{display:inline-block;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;color:white}
  ul{margin:8px 0;padding-left:20px}
  li{margin:4px 0}
</style></head>
<body>
  <div class="container">
    <div class="header"><h1>My<span>Adhikaar</span></h1></div>
    <div class="content">${htmlBody}</div>
    <div class="footer">© 2026 MyAdhikaar · support@myadhikaar.com<br>Automated message — please do not reply directly.</div>
  </div>
</body>
</html>`;
}
