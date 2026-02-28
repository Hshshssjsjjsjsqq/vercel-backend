import mongoose from "mongoose";

const liveChatSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    userName: {
      type: String,
      default: "Guest User",
    },
    userEmail: {
      type: String,
      default: "",
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    adminReply: {
      type: String,
      default: "",
      trim: true,
    },
    repliedAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["Open", "Closed"],
      default: "Open",
    },
    closedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.model("LiveChat", liveChatSchema);
