import express from "express";
import {
  createLiveChatMessage,
  getLiveChatMessages,
  getUserLiveChatMessages,
  replyToLiveChatMessage,
  closeLiveChatMessage,
} from "../controllers/liveChatController.js";

const router = express.Router();

router.post("/", createLiveChatMessage);
router.get("/admin", getLiveChatMessages);
router.get("/user/:userId", getUserLiveChatMessages);
router.put("/admin/:id/reply", replyToLiveChatMessage);
router.put("/admin/:id/close", closeLiveChatMessage);

export default router;
