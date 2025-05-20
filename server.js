const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const nodemailer = require("nodemailer");
const dotenv = require("dotenv");

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ----- Appointment Form Route -----
app.post("/api/submit-form", async (req, res) => {
  try {
    const { fullName, email, phoneNumber, selectedDate, message } = req.body;

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
      subject: "Appointment Request Received",
      html: `
    <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; max-width: 600px; margin: auto;">
      <h2 style="color: #2563eb; font-size: 24px; margin-bottom: 16px;">Appointment Request Received</h2>
      
      <p style="font-size: 16px; color: #374151;">Hello ${fullName},</p>
      <p style="margin: 12px 0; font-size: 15px;">Thank you for requesting an appointment. We’ve received your request for:</p>

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

    res.status(200).json({ success: true, message: "Appointment submitted" });
  } catch (error) {
    console.error("Appointment form error:", error);
    res.status(500).json({ success: false, message: "Appointment failed" });
  }
});

// ----- Volunteer Form Route -----
app.post("/api/volunteer-form", async (req, res) => {
  try {
    const { firstName, lastName, phone, email, message } = req.body;

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
      subject: "We received your volunteer request",
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
      message: "Volunteer form submitted successfully",
    });
  } catch (error) {
    console.error("Volunteer form error:", error);
    res
      .status(500)
      .json({ success: false, message: "Volunteer submission failed" });
  }
});

// Health Check Route
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "Server is running" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
