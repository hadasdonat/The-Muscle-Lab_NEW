import { getClassAttendance, listAttendanceClasses, saveClassAttendance } from "../services/attendanceService.js";

function sendError(res, error, fallback) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    console.error(`${fallback}:`, error.message);
    return res.status(500).json({ message: `${fallback}.` });
}

export async function listAttendanceClassesController(req, res) {
    try {
        res.status(200).json(await listAttendanceClasses(req.user, { from: req.query.from, to: req.query.to }));
    } catch (error) {
        sendError(res, error, "Failed to load classes");
    }
}

export async function getClassAttendanceController(req, res) {
    try {
        res.status(200).json(await getClassAttendance(req.user, req.params.id));
    } catch (error) {
        sendError(res, error, "Failed to load attendance");
    }
}

export async function saveClassAttendanceController(req, res) {
    try {
        res.status(200).json(await saveClassAttendance(req.user, req.params.id, req.body?.records));
    } catch (error) {
        sendError(res, error, "Failed to save attendance");
    }
}
