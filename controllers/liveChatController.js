import LiveChat from "../models/LiveChat.js";
import User from "../models/User.js";

export const createLiveChatMessage = async (req, res) => {
  try {
    const { userId, message } = req.body;

    if (!message || !String(message).trim()) {
      return res.status(400).json({ message: "Message is required." });
    }

    let userName = "Guest User";
    let userEmail = "";

    if (userId) {
      const user = await User.findById(userId).select("name email");
      if (user) {
        userName = user.name || userName;
        userEmail = user.email || "";
      }
    }

    const chat = await LiveChat.create({
      userId: userId || null,
      userName,
      userEmail,
      message: String(message).trim(),
    });

    res.status(201).json(chat);
  } catch (error) {
    res.status(500).json({ message: "Failed to send live chat message." });
  }
};

export const getLiveChatMessages = async (_req, res) => {
  try {
    const messages = await LiveChat.find().sort({ createdAt: -1 }).limit(100);
    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: "Failed to load live chat messages." });
  }
};

export const getUserLiveChatMessages = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ message: "User ID is required." });
    }

    const messages = await LiveChat.find({ userId }).sort({ createdAt: 1 }).limit(100);
    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: "Failed to load your chat messages." });
  }
};

export const replyToLiveChatMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { reply } = req.body;

    if (!reply || !String(reply).trim()) {
      return res.status(400).json({ message: "Reply is required." });
    }

    const updated = await LiveChat.findByIdAndUpdate(
      id,
      {
        adminReply: String(reply).trim(),
        repliedAt: new Date(),
      },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Chat message not found." });
    }

    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: "Failed to send admin reply." });
  }
};

export const closeLiveChatMessage = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await LiveChat.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ message: "Chat message not found." });
    }

    res.json({ message: "Chat closed and deleted successfully.", id });
  } catch (error) {
    res.status(500).json({ message: "Failed to close chat." });
  }
};
