import express from "express";
import { rateLimit } from "express-rate-limit";
import { getCoachInsightController } from "../controllers/coachController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorizeRoles } from "../middlewares/roleMiddleware.js";

const router = express.Router();

// Each uncached request can call a paid model, so limit it per signed-in user.
const coachLimit = rateLimit({
    windowMs: 60 * 1000,
    limit: 6,
    keyGenerator: req => `user:${req.user.id}`,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "Too many suggestion requests. Try again in a minute." }
});

router.get("/insight", authMiddleware, authorizeRoles("Member"), coachLimit, getCoachInsightController);

export default router;
