const nodemailer = require("nodemailer");

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000);
}

async function sendOTP(email) {
  const otp = generateOTP();

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "yourgmail@gmail.com",
      pass: "your_app_password"
    }
  });

  await transporter.sendMail({
    from: "yourgmail@gmail.com",
    to: email,
    subject: "Your OTP Code",
    text: `Your OTP is ${otp}`
  });

  console.log("OTP Sent:", otp);
}

sendOTP("user@example.com");