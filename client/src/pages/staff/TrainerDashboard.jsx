import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Star, ClipboardCheck, Users, Hourglass, MapPin } from "lucide-react";
import { getTrainerOverview } from "../../services/api";
import ActivityIcon from "../../components/ui/ActivityIcon";
import { activityStyle, formatDay, formatTime, toDateKey } from "../../utils/activities";
import "./TrainerDashboard.css";

function Stars({ value }) {
    return (
        <span className="t-stars" aria-label={`${value} out of 5`}>
            {[1, 2, 3, 4, 5].map(n => <Star key={n} size={14} fill={n <= Math.round(value) ? "currentColor" : "none"} />)}
        </span>
    );
}

function TrainerDashboard() {
    const [data, setData] = useState(null);
    const [error, setError] = useState("");

    useEffect(() => {
        getTrainerOverview().then(setData).catch(err => setError(err.message || "Your overview could not be loaded."));
    }, []);

    if (error) return <div className="trainer-page"><p className="t-error" role="alert">{error}</p></div>;
    if (!data) return <div className="trainer-page"><div className="t-tiles">{[0, 1, 2, 3].map(i => <div key={i} className="t-tile skeleton" />)}</div></div>;

    const today = toDateKey(new Date());
    const days = [];
    for (const item of data.schedule) {
        const last = days[days.length - 1];
        if (last && last.date === item.class_date) last.items.push(item); else days.push({ date: item.class_date, items: [item] });
    }
    const todayCount = data.schedule.filter(c => c.class_date === today).length;

    return (
        <div className="trainer-page">
            <header>
                <p className="t-eyebrow">{data.trainer.specialization}</p>
                <h1>Your week</h1>
                <p className="t-sub">{todayCount ? `You teach ${todayCount} ${todayCount === 1 ? "class" : "classes"} today.` : "No classes today."} {data.schedule.length} in the next 7 days.</p>
            </header>

            <div className="t-tiles">
                <div className="t-tile"><CalendarDays /><span>{data.stats.classesThisMonth}</span><small>classes taught this month</small></div>
                <div className="t-tile"><Star /><span>{data.stats.averageRating ?? "–"}</span><small>{data.stats.ratingCount ? `average from ${data.stats.ratingCount} ratings` : "no ratings yet"}</small></div>
                <div className="t-tile"><Users /><span>{data.stats.attendanceRate === null ? "–" : `${data.stats.attendanceRate}%`}</span><small>attendance, last 30 days</small></div>
                <Link to="/trainer/attendance" className={`t-tile action ${data.stats.bookingsToRecord ? "alert" : ""}`}>
                    <ClipboardCheck /><span>{data.stats.bookingsToRecord}</span><small>{data.stats.bookingsToRecord ? "bookings to record. Open attendance" : "attendance is up to date"}</small>
                </Link>
            </div>

            <div className="t-grid">
                <section className="t-card">
                    <h2>Schedule</h2>
                    {days.length === 0 && <p className="t-sub">Nothing scheduled in the next 7 days.</p>}
                    {days.map(day => (
                        <div key={day.date} className="t-day">
                            <h3>{day.date === today ? "Today" : formatDay(day.date, { weekday: "long", day: "numeric", month: "short" })}</h3>
                            <ul>
                                {day.items.map(c => {
                                    const fill = Math.min(100, Math.round((c.registered_count / c.capacity) * 100));
                                    return (
                                        <li key={c.id} style={{ "--accent": activityStyle(c.activity).color }}>
                                            <span className="t-time">{formatTime(c.start_time)}<small>{formatTime(c.end_time)}</small></span>
                                            <span className="t-icon"><ActivityIcon name={c.activity} size={18} /></span>
                                            <div className="t-info">
                                                <strong>{c.title}</strong>
                                                <span><MapPin size={12} /> {c.room}</span>
                                                <div className="t-fill"><div style={{ width: `${fill}%` }} /></div>
                                            </div>
                                            <span className="t-count">
                                                {c.registered_count}/{c.capacity}
                                                {c.waitlist_count > 0 && <small><Hourglass size={11} /> {c.waitlist_count} waiting</small>}
                                            </span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ))}
                </section>

                <section className="t-card">
                    <h2>Latest ratings</h2>
                    {data.recentRatings.length === 0 ? <p className="t-sub">Members can rate a class after it ends. Ratings show up here.</p> : (
                        <ul className="t-ratings">
                            {data.recentRatings.map((r, i) => (
                                <li key={i}>
                                    <div><Stars value={r.rating} /><span className="t-who">{r.first_name} · {r.title}, {formatDay(r.class_date)}</span></div>
                                    {r.comment && <p dir="auto">“{r.comment}”</p>}
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            </div>
        </div>
    );
}

export default TrainerDashboard;
