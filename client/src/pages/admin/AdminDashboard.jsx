import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Users, CalendarDays, CreditCard, TrendingUp, Sparkles, ClipboardCheck } from "lucide-react";
import { Link } from "react-router-dom";
import apiRequest from "../../services/api";
import "./AdminDashboard.css";

function formatDate(value, withTime = false) {
    if (!value) return "";
    // MySQL sends "YYYY-MM-DD" or "YYYY-MM-DD HH:MM:SS"; read both as local time.
    const [datePart, timePart = "00:00:00"] = String(value).split(" ");
    const [year, month, day] = datePart.split("-").map(Number);
    const [hours, minutes] = timePart.split(":").map(Number);
    return new Date(year, month - 1, day, hours, minutes).toLocaleString("en-GB", {
        weekday: withTime ? undefined : "short",
        day: "numeric",
        month: "short",
        ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {})
    });
}

function growthText(growth) {
    if (!growth) return "";
    const base = `${growth.thisMonth} new this month, ${growth.lastMonth} last month`;
    if (growth.changePercent === null) return base;
    const sign = growth.changePercent > 0 ? "+" : "";
    return `${base} (${sign}${growth.changePercent}%)`;
}

function RateBar({ label, value, detail, emptyText }) {
    return (
        <div className="admin-bar-item">
            <div className="admin-bar-label">
                <label>{label}</label>
                <strong>{value === null ? "–" : `${value}%`}</strong>
            </div>
            <div className="admin-bar-track"><div style={{ width: `${value ?? 0}%` }} /></div>
            <small>{value === null ? emptyText : detail}</small>
        </div>
    );
}

function AdminDashboard() {
    const [stats, setStats] = useState(null);
    const [status, setStatus] = useState("loading");

    const loadStats = useCallback(async () => {
        setStatus("loading");
        try {
            setStats(await apiRequest("/dashboard/admin-overview"));
            setStatus("ready");
        } catch (error) {
            console.error(error);
            setStatus("error");
        }
    }, []);

    useEffect(() => {
        loadStats();
    }, [loadStats]);

    const cards = useMemo(() => stats ? [
        { title: "Members", value: stats.memberCount, detail: growthText(stats.memberGrowth), icon: Users },
        { title: "Active memberships", value: stats.activeMembershipCount, detail: stats.activeMembershipRate === null ? "" : `${stats.activeMembershipRate}% of members`, icon: CreditCard },
        { title: "Classes this week", value: stats.upcomingClassCount, detail: "Today and the next 6 days", icon: CalendarDays },
        { title: "Bookings this week", value: stats.upcomingRegistrationCount, detail: "Registrations for those classes", icon: TrendingUp }
    ] : [], [stats]);

    if (status === "loading" && !stats) {
        return <div className="admin-dashboard-loading">Loading admin insights...</div>;
    }

    if (status === "error" && !stats) {
        return (
            <div className="admin-dashboard-loading" role="alert">
                <p>The dashboard could not be loaded.</p>
                <button type="button" className="admin-dashboard-retry" onClick={loadStats}>Try again</button>
            </div>
        );
    }

    return (
        <div className="admin-dashboard-page">
            <div className="admin-dashboard-header">
                <div>
                    <p className="admin-dashboard-eyebrow">Operations center</p>
                    <h1>Admin dashboard</h1>
                </div>
                <button type="button" className="admin-dashboard-chip" onClick={loadStats} disabled={status === "loading"}>
                    {status === "loading" ? "Refreshing..." : "Refresh"}
                </button>
            </div>

            <div className="admin-dashboard-grid">
                {cards.map(({ title, value, detail, icon: Icon }) => (
                    <div key={title} className="admin-stat-card">
                        <div className="admin-stat-icon">
                            <Icon size={18} />
                        </div>
                        <div>
                            <h3>{title}</h3>
                            <p>{value}</p>
                            {detail && <small className="admin-stat-detail">{detail}</small>}
                        </div>
                    </div>
                ))}
            </div>

            <div className="admin-dashboard-panel">
                <div className="admin-dashboard-panel-header">
                    <BarChart3 size={18} />
                    <h2>Rates</h2>
                </div>
                <div className="admin-dashboard-bars">
                    <RateBar
                        label="Active membership rate"
                        value={stats.activeMembershipRate}
                        detail={`${stats.activeMembershipCount} of ${stats.memberCount} members have an active plan`}
                        emptyText="No members yet"
                    />
                    <RateBar
                        label="Attendance rate (last 30 days)"
                        value={stats.attendance.rate}
                        detail={`${stats.attendance.attended} of ${stats.attendance.recorded} recorded bookings attended`}
                        emptyText="No attendance recorded yet."
                    />
                </div>
                <Link to="/admin/attendance" className="admin-dashboard-link">
                    <ClipboardCheck size={16} /> Record attendance
                </Link>
            </div>

            <div className="admin-dashboard-columns">
                <div className="admin-dashboard-activity">
                    <div className="admin-dashboard-activity-header">
                        <div className="admin-dashboard-activity-title">
                            <CalendarDays size={16} />
                            <h3>Next classes</h3>
                        </div>
                    </div>
                    {stats.nextClasses.length === 0 ? (
                        <p className="admin-dashboard-empty">No upcoming classes. Add one on the Classes page.</p>
                    ) : (
                        <ul>
                            {stats.nextClasses.map(item => (
                                <li key={item.id}>
                                    <strong>{item.title}</strong>
                                    <span>{formatDate(item.class_date)} · {String(item.start_time).slice(0, 5)} · {item.trainer_name}</span>
                                    <div className="admin-fill" aria-label={`${item.registered_count} of ${item.capacity} places booked`}>
                                        <div className="admin-bar-track"><div style={{ width: `${Math.min(100, (item.registered_count / item.capacity) * 100)}%` }} /></div>
                                        <small>{item.registered_count}/{item.capacity}</small>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="admin-dashboard-activity">
                    <div className="admin-dashboard-activity-header">
                        <div className="admin-dashboard-activity-title">
                            <Sparkles size={16} />
                            <h3>Recent bookings</h3>
                        </div>
                    </div>
                    {stats.recentRegistrations.length === 0 ? (
                        <p className="admin-dashboard-empty">No bookings yet.</p>
                    ) : (
                        <ul>
                            {stats.recentRegistrations.map(item => (
                                <li key={item.id}>
                                    <strong>{item.member_name}</strong>
                                    <span>{item.class_title} on {formatDate(item.class_date)}</span>
                                    <small>Booked {formatDate(item.registration_date, true)}</small>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}

export default AdminDashboard;
