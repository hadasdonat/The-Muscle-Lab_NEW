import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { CalendarDays, CreditCard, Flame, Trophy, MessageCircle, Star, ArrowRight, Clock3, MapPin } from "lucide-react";

import Button from "../../components/ui/Button";
import AICoach from "../../components/ai/AICoach";
import ActivityIcon from "../../components/ui/ActivityIcon";
import useClassBooking from "../../hooks/useClassBooking";
import apiRequest, { getMyClasses, getProgress, getClassesToRate, rateClass } from "../../services/api";
import { activityStyle, formatDay, formatTime, toDateKey } from "../../utils/activities";
import "./Dashboard.css";

const MONTHLY_GOAL = 8;

function relativeDay(key) {
    if (key === toDateKey(new Date())) return "Today";
    if (key === toDateKey(new Date(Date.now() + 86400000))) return "Tomorrow";
    return formatDay(key);
}

function RateCard({ item, onDone }) {
    const [rating, setRating] = useState(0);
    const [hover, setHover] = useState(0);
    const [comment, setComment] = useState("");
    const [saving, setSaving] = useState(false);

    async function submit() {
        setSaving(true);
        try {
            await rateClass(item.id, rating, comment);
            toast.success(`Thanks! ${item.trainer_name.split(" ")[0]} will see your rating.`);
            onDone();
        } catch (error) {
            toast.error(error.message || "Could not save your rating.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="dashboard-card rate-card" style={{ "--accent": activityStyle(item.activity).color }}>
            <div className="card-header">
                <Star />
                <h2>How was {item.title}?</h2>
            </div>
            <p className="muted">{formatDay(item.class_date)} at {formatTime(item.start_time)} with {item.trainer_name}</p>
            <div className="stars" role="radiogroup" aria-label="Your rating" onMouseLeave={() => setHover(0)}>
                {[1, 2, 3, 4, 5].map(value => (
                    <button key={value} type="button" role="radio" aria-checked={rating === value} aria-label={`${value} star${value > 1 ? "s" : ""}`}
                        className={(hover || rating) >= value ? "on" : ""} onMouseEnter={() => setHover(value)} onClick={() => setRating(value)}>
                        <Star size={26} fill="currentColor" />
                    </button>
                ))}
            </div>
            {rating > 0 && (
                <>
                    <label className="visually-hidden" htmlFor={`comment-${item.id}`}>Comment (optional)</label>
                    <textarea id={`comment-${item.id}`} rows={2} maxLength={500} placeholder="Anything to add? (optional)" value={comment} onChange={e => setComment(e.target.value)} />
                    <button type="button" className="dash-primary" disabled={saving} onClick={submit}>{saving ? "Saving..." : "Send rating"}</button>
                </>
            )}
        </div>
    );
}

function Dashboard() {
    const [membership, setMembership] = useState(null);
    const [myClasses, setMyClasses] = useState([]);
    const [progress, setProgress] = useState(null);
    const [toRate, setToRate] = useState([]);
    const [loading, setLoading] = useState(true);

    const loadDashboard = useCallback(async () => {
        try {
            const [membershipData, classesData, progressData, rateData] = await Promise.all([
                apiRequest("/user-memberships/me").catch(() => null),
                getMyClasses(),
                getProgress().catch(() => null),
                getClassesToRate().catch(() => [])
            ]);
            setMembership(membershipData);
            setMyClasses(classesData);
            setProgress(progressData);
            setToRate(rateData);
        } catch (err) {
            toast.error(err.message || "Your dashboard could not be loaded.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadDashboard(); }, [loadDashboard]);
    const booking = useClassBooking(loadDashboard);

    if (loading) {
        return (
            <div className="dashboard-page">
                <div className="dashboard-stats">{[0, 1, 2, 3].map(i => <div key={i} className="stat-card skeleton" />)}</div>
            </div>
        );
    }

    const upcoming = myClasses.filter(c => !c.has_started);
    const nextClass = upcoming[0] || null;
    const monthCount = progress?.thisMonth ?? 0;
    const goalPercent = Math.min(100, Math.round((monthCount / MONTHLY_GOAL) * 100));

    return (
        <div className="dashboard-page">
            <div className="dashboard-stats">
                <div className="stat-card">
                    <div className="stat-icon"><CreditCard /></div>
                    <h3>Membership</h3>
                    <span>{membership?.name || "No plan yet"}</span>
                    <small>{membership?.end_date ? `Until ${formatDay(membership.end_date, { day: "numeric", month: "short", year: "numeric" })}` : <Link to="/member/membership">Choose a plan</Link>}</small>
                </div>
                <div className="stat-card">
                    <div className="stat-icon"><CalendarDays /></div>
                    <h3>Next class</h3>
                    <span>{nextClass ? nextClass.title : "Nothing booked"}</span>
                    <small>{nextClass ? `${relativeDay(nextClass.class_date)} at ${formatTime(nextClass.start_time)}` : <Link to="/member/classes">Find a class</Link>}</small>
                </div>
                <div className="stat-card">
                    <div className="stat-icon"><Flame /></div>
                    <h3>Week streak</h3>
                    <span>{progress?.streak ?? 0} {progress?.streak === 1 ? "week" : "weeks"}</span>
                    <small>Best: {progress?.bestStreak ?? 0} weeks</small>
                </div>
                <div className="stat-card">
                    <div className="stat-icon"><Trophy /></div>
                    <h3>Badges</h3>
                    <span>{progress ? progress.badges.filter(b => b.earned).length : 0} / {progress?.badges.length ?? 9}</span>
                    <small><Link to="/member/progress">See your progress</Link></small>
                </div>
            </div>

            <div className="dashboard-grid">
                <div className="dashboard-left">
                    <div className="dashboard-card">
                        <div className="card-header">
                            <CalendarDays />
                            <h2>Your upcoming classes</h2>
                            <Link className="card-link" to="/member/classes">Book more <ArrowRight size={14} /></Link>
                        </div>
                        {upcoming.length > 0 ? (
                            <ul className="upcoming-list">
                                {upcoming.slice(0, 4).map(gymClass => (
                                    <li key={gymClass.id} style={{ "--accent": activityStyle(gymClass.activity).color }}>
                                        <span className="upcoming-icon"><ActivityIcon name={gymClass.activity} size={18} /></span>
                                        <div className="upcoming-info">
                                            <strong>{gymClass.title}</strong>
                                            <span><Clock3 size={13} /> {relativeDay(gymClass.class_date)}, {formatTime(gymClass.start_time)}–{formatTime(gymClass.end_time)}</span>
                                            <span><MapPin size={13} /> {gymClass.room} · {gymClass.trainer_name}</span>
                                        </div>
                                        <button type="button" className="class-link-button" disabled={booking.busyId === gymClass.id} onClick={() => booking.onCancel(gymClass)}>Cancel</button>
                                    </li>
                                ))}
                                {upcoming.length > 4 && <li className="upcoming-more">+{upcoming.length - 4} more booked</li>}
                            </ul>
                        ) : (
                            <div className="dash-empty">
                                <p>You have no upcoming classes. The AI Coach on the right can pick one for you.</p>
                                <Button to="/member/classes">Browse classes</Button>
                            </div>
                        )}
                    </div>

                    {toRate[0] && <RateCard key={toRate[0].id} item={toRate[0]} onDone={loadDashboard} />}

                    <div className="dashboard-card">
                        <div className="card-header">
                            <Trophy />
                            <h2>Monthly goal</h2>
                            <Link className="card-link" to="/member/progress">Progress <ArrowRight size={14} /></Link>
                        </div>
                        <p className="muted">{monthCount >= MONTHLY_GOAL ? "Goal reached. Nice work!" : `${MONTHLY_GOAL - monthCount} more ${MONTHLY_GOAL - monthCount === 1 ? "class" : "classes"} to reach ${MONTHLY_GOAL} this month.`}</p>
                        <div className="progress"><div className="progress-fill" style={{ width: `${goalPercent}%` }} /></div>
                        <span>{monthCount} / {MONTHLY_GOAL} classes</span>
                    </div>
                </div>

                <div className="dashboard-right">
                    <AICoach onRegistered={loadDashboard} />
                    <Link to="/member/coach" className="dashboard-card chat-teaser">
                        <span className="chat-teaser-icon"><MessageCircle /></span>
                        <span>
                            <strong>Talk to your coach</strong>
                            <small>Ask anything about training, by typing or by voice.</small>
                        </span>
                        <ArrowRight size={18} />
                    </Link>
                </div>
            </div>
        </div>
    );
}

export default Dashboard;
