import express from "express";
import {
    getClassAttendanceController,
    listAttendanceClassesController,
    saveClassAttendanceController
} from "../controllers/attendanceController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorizeRoles } from "../middlewares/roleMiddleware.js";

const router = express.Router();
const staff = [authMiddleware, authorizeRoles("Admin", "Trainer")];

router.get("/classes", ...staff, listAttendanceClassesController);
router.get("/classes/:id", ...staff, getClassAttendanceController);
router.put("/classes/:id", ...staff, saveClassAttendanceController);

export default router;
