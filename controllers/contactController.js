import ContactMessage from "../models/ContactMessage.js";

export const createContactMessage = async (req, res) => {
  try {
    const { fullName, email, message } = req.body;

    if (!fullName || !email || !message) {
      return res.status(400).json({ message: "Full name, email, and message are required." });
    }

    const saved = await ContactMessage.create({
      fullName: String(fullName).trim(),
      email: String(email).trim().toLowerCase(),
      message: String(message).trim(),
    });

    res.status(201).json({
      message: "Your message has been sent successfully.",
      id: saved._id,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to send contact message." });
  }
};

export const getContactMessages = async (_req, res) => {
  try {
    const messages = await ContactMessage.find().sort({ createdAt: -1 }).limit(200);
    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: "Failed to load contact messages." });
  }
};
