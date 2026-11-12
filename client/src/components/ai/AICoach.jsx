import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, CalendarDays, MapPin, RefreshCw, Lightbulb, User } from "lucide-react";
import { formatClassTime, getCoachInsight } from "../../services/aiService";
import { registerToClass } from "../../services/api";
import "./AICoach.css";

function AICoach({ onRegistered }) {
    const [insight, setInsight] = useState(null);
    const [status, setStatus] = useState("loading");
    const [message, setMessage] = useState("");
    const [booking, setBooking] = useState(false);
    const requestId = useRef(0);

    const load = useCallback(async ({ refresh = false, keepMessage = false } = {}) => {
        const current = ++requestId.current;
        setStatus("loading");
        if (!keepMessage) setMessage("");
        try {
            const result = await getCoachInsight({ refresh });
            if (current !== requestId.current) return; // a newer request already finished
            setInsight(result);
            setStatus("ready");
        } catch (error) {
            if (current !== requestId.current) return;
            setStatus("error");
            setMessage(error.message || "Could not load a suggestion.");
        }
    }, []);

    useEffect(() => {
        load();
        return () => { requestId.current += 1; };
    }, [load]);

    async function handleBook() {
        const suggestion = insight?.suggestion;
        if (!suggestion) return;
        setBooking(true);
        setMessage("");
        try {
            await registerToClass(suggestion.classId);
            setMessage(`You're registered for ${suggestion.title}.`);
            onRegistered?.();
            await load({ refresh: true, keepMessage: true });
        } catch (error) {
            setMessage(error.message || "Registration failed.");
        } finally {
            setBooking(false);
        }
    }

    const suggestion = insight?.suggestion;
    const sourceLabel = insight?.source === "llm" ? `Powered by ${insight.model}` : "Based on your history";

    return (
        <div className="ai-coach-card" aria-busy={status === "loading"}>
            <div className="ai-coach-header">
                <div className="ai-coach-title-group">
                    <Sparkles size={20} />
                    <h3>AI Coach</h3>
                </div>
                <div className="ai-coach-actions">
                    {status === "ready" && <span className="ai-chip">{sourceLabel}</span>}
                    <button
                        type="button"
                        className="ai-icon-button"
                        onClick={() => load({ refresh: true })}
                        disabled={status === "loading" || booking}
                        aria-label="Get a new suggestion"
                        title="Get a new suggestion"
                    >
                        <RefreshCw size={16} />
                    </button>
                </div>
            </div>

            {status === "loading" && <p className="ai-loading">Looking at your recent classes...</p>}

            {status === "error" && (
                <div className="ai-error" role="alert">
                    <p>{message}</p>
                    <button type="button" className="ai-secondary-button" onClick={() => load()}>Try again</button>
                </div>
            )}

            {status === "ready" && insight && (
                <>
                    <p className="ai-summary">{insight.summary}</p>

                    {suggestion ? (
                        <div className="ai-suggestion-box">
                            <strong className="ai-suggestion-title">{suggestion.title}</strong>
                            <ul className="ai-suggestion-meta">
                                <li><CalendarDays size={14} />{formatClassTime(suggestion)}</li>
                                <li><User size={14} />{suggestion.trainer}</li>
                                {suggestion.room && <li><MapPin size={14} />{suggestion.room}</li>}
                            </ul>
                            <div className="ai-suggestion-footer">
                                <span>{suggestion.spotsLeft} spot{suggestion.spotsLeft === 1 ? "" : "s"} left</span>
                                <button type="button" className="ai-book-button" onClick={handleBook} disabled={booking}>
                                    {booking ? "Registering..." : "Register"}
                                </button>
                            </div>
                        </div>
                    ) : null}

                    {insight.reasons?.length > 0 && (
                        <ul className="ai-reasons">
                            {insight.reasons.map(reason => (
                                <li key={reason} className="ai-reason-item">
                                    <Sparkles size={14} />
                                    <span>{reason}</span>
                                </li>
                            ))}
                        </ul>
                    )}

                    {insight.tip && (
                        <p className="ai-tip"><Lightbulb size={14} />{insight.tip}</p>
                    )}

                    {message && <p className="ai-message" role="status">{message}</p>}
                </>
            )}
        </div>
    );
}

export default AICoach;
