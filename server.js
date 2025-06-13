const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const nodemailer = require("nodemailer");
const dotenv = require("dotenv");
const Razorpay = require("razorpay");
const crypto = require("crypto");

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(
  cors({
    origin: "https://shifafoundation.net",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Email transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Verify email configuration
transporter.verify((error, success) => {
  if (error) {
    console.error("Email configuration error:", error);
  } else {
    console.log("Email server is ready to send messages");
  }
});

// Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY,
  key_secret: process.env.RAZORPAY_SECRET,
});

// Health check route
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
  });
});

// ----- Donation Routes -----

// Create Razorpay order
app.post("/api/create-order", async (req, res) => {
  try {
    const { amount } = req.body;

    // Validation
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid amount. Please enter a valid positive number.",
      });
    }

    // Convert to number and validate range
    const numAmount = parseFloat(amount);
    if (numAmount < 1) {
      return res.status(400).json({
        success: false,
        message: "Minimum donation amount is ₹1",
      });
    }

    if (numAmount > 500000) {
      return res.status(400).json({
        success: false,
        message: "Maximum donation amount is ₹5,00,000",
      });
    }

    const options = {
      amount: Math.round(numAmount * 100), // Convert to paise and ensure integer
      currency: "INR",
      receipt: `donation_${Date.now()}_${Math.random()
        .toString(36)
        .substring(7)}`,
      payment_capture: 1, // Auto capture payment
    };

    console.log(
      "[/api/create-order] Received amount from req.body:",
      req.body.amount
    );
    console.log("[/api/create-order] Parsed numAmount:", numAmount);
    console.log(
      "[/api/create-order] Creating Razorpay order with options:",
      JSON.stringify(options, null, 2)
    );

    const order = await razorpay.orders.create(options);

    console.log(
      "[/api/create-order] Razorpay order created successfully. Order ID:",
      order.id
    );
    console.log(
      "[/api/create-order] Full order response from Razorpay:",
      JSON.stringify(order, null, 2)
    );

    res.status(200).json({
      success: true,
      order: order,
      message: "Order created successfully",
    });
  } catch (err) {
    console.error(
      "[/api/create-order] Full error object in create-order:",
      err
    );
    console.error("Razorpay order creation error:", err.message || err);

    // Handle specific Razorpay errors
    if (err.error && err.error.code) {
      return res.status(400).json({
        success: false,
        message: `Payment gateway error: ${
          err.error.description || err.error.code
        }`,
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to create payment order. Please try again.",
    });
  }
});

// Verify payment and send confirmation email
app.post("/api/verify-payment", async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      donorEmail,
      donorName,
      amount,
    } = req.body;

    // Validation
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Missing payment verification data",
      });
    }

    if (!donorEmail || !donorName || !amount) {
      return res.status(400).json({
        success: false,
        message: "Missing donor information",
      });
    }

    // Verify signature
    console.log(
      "[/api/verify-payment] Received for verification:",
      JSON.stringify(req.body, null, 2)
    );
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    console.log(
      "[/api/verify-payment] String to hash for signature (body):",
      body.toString()
    );
    console.log(
      "[/api/verify-payment] RAZORPAY_SECRET being used for HMAC (is set):",
      !!process.env.RAZORPAY_SECRET
    );
    // console.log("[/api/verify-payment] RAZORPAY_SECRET (first 5 chars for debug):", process.env.RAZORPAY_SECRET ? process.env.RAZORPAY_SECRET.substring(0,5) : "Not Set"); // Uncomment for more detail if needed

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_SECRET)
      .update(body.toString())
      .digest("hex");

    console.log(
      "[/api/verify-payment] Expected signature (calculated by server):",
      expectedSignature
    );
    console.log(
      "[/api/verify-payment] Received signature (from client/Razorpay):",
      razorpay_signature
    );

    console.log("Payment verification details:", {
      order_id: razorpay_order_id,
      payment_id: razorpay_payment_id,
      signature_match: expectedSignature === razorpay_signature,
      expected_signature_debug: expectedSignature,
      received_signature_debug: razorpay_signature,
    });

    if (expectedSignature !== razorpay_signature) {
      console.error("Signature verification failed");
      return res.status(400).json({
        success: false,
        message: "Payment verification failed. Invalid signature.",
      });
    }

    // Payment verified successfully - send confirmation email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: donorEmail,
      subject: "Thank You for Your Donation - Shifa Foundation",
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: auto; border: 1px solid #ddd; border-radius: 8px; background-color: #f9f9f9;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h1 style="color: #10B981; margin-bottom: 10px;">Thank You for Your Donation!</h1>
            <div style="width: 50px; height: 3px; background-color: #10B981; margin: 0 auto;"></div>
          </div>
          
          <div style="background-color: white; padding: 20px; border-radius: 6px; margin-bottom: 20px;">
            <p style="font-size: 16px; margin-bottom: 15px;">Dear ${donorName},</p>
            
            <p style="font-size: 15px; line-height: 1.6; margin-bottom: 15px;">
              We are deeply grateful for your generous donation of <strong style="color: #10B981;">₹${amount}</strong>. 
              Your contribution will make a meaningful difference in the lives of those we serve.
            </p>
            
            <div style="background-color: #f0f9ff; padding: 15px; border-radius: 4px; border-left: 4px solid #10B981; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; color: #333; font-size: 16px;">Payment Details:</h3>
              <p style="margin: 5px 0; font-size: 14px;"><strong>Payment ID:</strong> ${razorpay_payment_id}</p>
              <p style="margin: 5px 0; font-size: 14px;"><strong>Order ID:</strong> ${razorpay_order_id}</p>
              <p style="margin: 5px 0; font-size: 14px;"><strong>Amount:</strong> ₹${amount}</p>
              <p style="margin: 5px 0; font-size: 14px;"><strong>Date:</strong> ${new Date().toLocaleDateString(
                "en-IN",
                {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  timeZone: "Asia/Kolkata",
                }
              )}</p>
            </div>
            
            <p style="font-size: 15px; line-height: 1.6; margin-bottom: 15px;">
              Your support helps us continue our mission to provide food, clothing, education, 
              and essential support to those in need. Every donation, regardless of size, 
              creates a ripple effect of positive change in our community.
            </p>
            
            <p style="font-size: 15px; line-height: 1.6; margin-bottom: 20px;">
              We will keep you updated on how your contribution is making a difference. 
              If you have any questions or would like to get more involved, please don't hesitate to contact us.
            </p>
          </div>
          
          <div style="text-align: center; color: #666; font-size: 14px; border-top: 1px solid #ddd; padding-top: 20px;">
            <p style="margin: 0 0 10px 0;">With heartfelt gratitude,</p>
            <p style="margin: 0; font-weight: bold; color: #10B981;">The Shifa Foundation Team</p>
            <p style="margin: 10px 0 0 0; font-size: 12px;">
              This is an automated confirmation email. Please save this for your records.
            </p>
          </div>
        </div>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log("Confirmation email sent to:", donorEmail);
    } catch (mailErr) {
      console.error("Email sending failed:", mailErr);
      // Don't fail the payment verification if email fails
    }

    // Also send notification to admin
    try {
      const adminNotification = {
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_USER,
        subject: `New Donation Received - ₹${amount}`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: auto;">
            <h2 style="color: #10B981;">New Donation Received</h2>
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px;">
              <p><strong>Donor:</strong> ${donorName}</p>
              <p><strong>Email:</strong> ${donorEmail}</p>
              <p><strong>Amount:</strong> ₹${amount}</p>
              <p><strong>Payment ID:</strong> ${razorpay_payment_id}</p>
              <p><strong>Order ID:</strong> ${razorpay_order_id}</p>
              <p><strong>Date:</strong> ${new Date().toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
              })}</p>
            </div>
          </div>
        `,
      };

      await transporter.sendMail(adminNotification);
      console.log("Admin notification sent");
    } catch (adminMailErr) {
      console.error("Admin notification failed:", adminMailErr);
    }

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully and confirmation email sent!",
    });
  } catch (error) {
    console.error(
      "[/api/verify-payment] Full error object in verify-payment:",
      error
    );
    console.error("Payment verification error:", error.message || error);
    return res.status(500).json({
      success: false,
      message: "Payment verification failed. Please contact support.",
    });
  }
});

// ----- Appointment Form Route -----
app.post("/api/submit-form", async (req, res) => {
  try {
    const { fullName, email, phoneNumber, selectedDate, message } = req.body;

    if (!fullName || !email || !phoneNumber || !selectedDate) {
      return res.status(400).json({
        success: false,
        message: "Please fill in all required fields",
      });
    }

    const formattedDate = new Date(selectedDate).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const adminMailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: "Shifa Foundation Health Care Appointment Request",
      html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; max-width: 600px; margin: auto;">
        <h2 style="color: #059669; font-size: 24px; margin-bottom: 16px;">New Appointment Request</h2>
        
        <div style="background-color: #ffffff; padding: 16px; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <p style="margin-bottom: 8px;"><strong>Name:</strong> ${fullName}</p>
          <p style="margin-bottom: 8px;"><strong>Email:</strong> ${email}</p>
          <p style="margin-bottom: 8px;"><strong>Phone:</strong> ${phoneNumber}</p>
          <p style="margin-bottom: 8px;"><strong>Date:</strong> ${formattedDate}</p>
          <p style="margin-bottom: 8px;"><strong>Message:</strong> ${
            message || "No message provided"
          }</p>
        </div>

        <p style="margin-top: 16px; font-size: 14px; color: #4b5563;">Please respond to this request promptly.</p>
      </div>
    `,
    };

    const clientMailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Appointment Request Received - Shifa Foundation",
      html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; max-width: 600px; margin: auto;">
        <h2 style="color: #2563eb; font-size: 24px; margin-bottom: 16px;">Appointment Request Received</h2>
        
        <p style="font-size: 16px; color: #374151;">Hello ${fullName},</p>
        <p style="margin: 12px 0; font-size: 15px;">Thank you for requesting an appointment. We've received your request for:</p>

        <div style="background-color: #e0f2fe; padding: 12px 16px; border-radius: 6px; margin: 12px 0;">
          <p style="margin: 0;"><strong>Date:</strong> ${formattedDate}</p>
        </div>

        <p style="font-size: 15px;">Our team will get in touch with you soon.</p>

        <p style="margin-top: 20px; font-size: 14px; color: #4b5563;">Best regards,<br>Shifa Foundation</p>
      </div>
    `,
    };

    await transporter.sendMail(adminMailOptions);
    await transporter.sendMail(clientMailOptions);

    res.status(200).json({
      success: true,
      message: "Appointment request submitted successfully",
    });
  } catch (error) {
    console.error("Appointment form error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to submit appointment request",
    });
  }
});

// ----- Volunteer Form Route -----
app.post("/api/volunteer-form", async (req, res) => {
  try {
    const { firstName, lastName, phone, email, message } = req.body;

    if (!firstName || !lastName || !phone || !email) {
      return res.status(400).json({
        success: false,
        message: "Please fill in all required fields",
      });
    }

    const adminMailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      subject: "New Volunteer Submission - Shifa Foundation",
      html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 5px;">
        <h2 style="color: #4A90E2;">New Volunteer Request</h2>
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p><strong>First Name:</strong> ${firstName}</p>
          <p><strong>Last Name:</strong> ${lastName}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Phone:</strong> ${phone}</p>
          <p><strong>Message:</strong> ${message || "No message provided"}</p>
        </div>
        <p>Please follow up with the volunteer.</p>
      </div>
    `,
    };

    const clientMailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "We received your volunteer request - Shifa Foundation",
      html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 5px;">
        <h2 style="color: #4A90E2;">Thank You for Volunteering</h2>
        <p>Hi ${firstName},</p>
        <p>Thank you for showing interest in volunteering with Shifa Foundation.</p>
        <p>Our team will reach out to you shortly.</p>
        <p>Warm regards,<br/>Shifa Foundation</p>
      </div>
    `,
    };

    await transporter.sendMail(adminMailOptions);
    await transporter.sendMail(clientMailOptions);

    res.status(200).json({
      success: true,
      message: "Volunteer application submitted successfully",
    });
  } catch (error) {
    console.error("Volunteer form error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to submit volunteer application",
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check available at: http://localhost:${PORT}/api/health`);
});
