-- For databases created before attendance tracking was added.
-- One attendance record per class registration. Remove any duplicates first:
-- SELECT class_registration_id, COUNT(*) FROM Attendance GROUP BY class_registration_id HAVING COUNT(*) > 1;
ALTER TABLE Attendance ADD UNIQUE KEY uq_attendance_registration (class_registration_id);
