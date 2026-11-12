import express from "express";
import { createCorsOptions } from "./config/cors.js";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import userRoutes from "./routes/userRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import membershipPlanRoutes from "./routes/membershipPlanRoutes.js";
import userMembershipRoutes from "./routes/userMembershipRoutes.js";
import classRoutes from "./routes/classRoutes.js";
import trainerRoutes from "./routes/trainerRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import coachRoutes from "./routes/coachRoutes.js";
import attendanceRoutes from "./routes/attendanceRoutes.js";
import memberRoutes from "./routes/memberRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import trainerWorkspaceRoutes from "./routes/trainerWorkspaceRoutes.js";
import { ACTIVITIES } from "./config/activities.js";

dotenv.config();

const app = express();
app.disable("x-powered-by");
// Behind a hosting proxy (Render, Railway, Fly) every request arrives from the proxy's IP,
// so per-IP limits would be shared by all users. TRUST_PROXY is the number of proxy hops.
if (/^\d+$/.test(process.env.TRUST_PROXY || "")) app.set("trust proxy", Number(process.env.TRUST_PROXY));

const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);

// middlewares
app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
});
app.use(cors(createCorsOptions()));
app.use(express.json());


app.use(
    "/uploads",
    express.static(
        path.join(__dirname, "uploads")
    )
);
app.use(
    "/api/membership-plans",
    membershipPlanRoutes
);
app.get("/api/health", (req, res) => res.status(200).json({ status: "ok" }));
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use(
    "/api/user-memberships",
    userMembershipRoutes
);
app.use(
    "/api/classes",
    classRoutes
);
app.use("/api/trainers", trainerRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/coach", coachRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/me", memberRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/trainer", trainerWorkspaceRoutes);
app.get("/api/activities", (req, res) => res.json(ACTIVITIES));
// Keep parser/upload failures JSON-shaped for the fetch client.
app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.code === "LIMIT_FILE_SIZE" ? 413 :
        error.name === "MulterError" ? 400 : error.status || 500;
    res.status(status).json({ message: status >= 500 ? "Internal server error" : error.message });
});
export default app;