import express from "express";
import { createContactMessage, getContactMessages } from "../controllers/contactController.js";

const router = express.Router();

router.post("/", createContactMessage);
router.get("/admin", getContactMessages);

export default router;
