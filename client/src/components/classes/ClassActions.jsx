import { Check, Hourglass } from "lucide-react";

function ClassActions({ gymClass, busy, onRegister, onCancel, onJoinWaitlist, onLeaveWaitlist, compact = false }) {
    const full = gymClass.available_spots <= 0;
    if (gymClass.is_registered) {
        return (
            <div className="class-actions">
                <span className="class-status booked"><Check size={15} /> You're booked</span>
                <button type="button" className="class-link-button" disabled={busy} onClick={() => onCancel(gymClass)}>Cancel</button>
            </div>
        );
    }
    if (gymClass.waitlist_position) {
        return (
            <div className="class-actions">
                <span className="class-status waiting"><Hourglass size={15} /> #{gymClass.waitlist_position} on the waitlist</span>
                <button type="button" className="class-link-button" disabled={busy} onClick={() => onLeaveWaitlist(gymClass)}>Leave</button>
            </div>
        );
    }
    if (full) {
        return (
            <button type="button" className={`class-button secondary ${compact ? "compact" : ""}`} disabled={busy} onClick={() => onJoinWaitlist(gymClass)}>
                Join waitlist{gymClass.waitlist_count ? ` · ${gymClass.waitlist_count} waiting` : ""}
            </button>
        );
    }
    return (
        <button type="button" className={`class-button ${compact ? "compact" : ""}`} disabled={busy} onClick={() => onRegister(gymClass)}>
            {busy ? "Booking..." : "Register"}
        </button>
    );
}

export default ClassActions;
