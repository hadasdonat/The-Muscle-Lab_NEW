import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Mic, MicOff, Send, Sparkles, Volume2, VolumeX, CalendarDays, User, MapPin, Check, RotateCcw } from "lucide-react";
import { registerToClass, sendCoachMessage } from "../../services/api";
import ActivityIcon from "../../components/ui/ActivityIcon";
import { activityStyle, formatDay } from "../../utils/activities";
import "./CoachChat.css";

const STARTERS = [
    "Plan my training week",
    "I'm a beginner. Where should I start?",
    "I only have 45 minutes after work",
    "מה מומלץ לחיזוק הגב?"
];

const SpeechRecognition = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;
const hasHebrew = text => /[֐-׿]/.test(text);

function readSetting(key, fallback) {
    try { const value = localStorage.getItem(key); return value === null ? fallback : value === "1"; } catch { return fallback; }
}
function saveSetting(key, value) {
    try { localStorage.setItem(key, value ? "1" : "0"); } catch { /* not stored, still works for this visit */ }
}

function ClassCard({ suggestion }) {
    const [state, setState] = useState("idle");
    const style = activityStyle(suggestion.activity);

    async function book() {
        setState("busy");
        try {
            await registerToClass(suggestion.classId);
            setState("done");
            toast.success(`Booked: ${suggestion.title}, ${formatDay(suggestion.date)} at ${suggestion.startTime}`);
        } catch (error) {
            setState("idle");
            toast.error(error.message || "Registration failed.");
        }
    }

    return (
        <div className="chat-class" style={{ "--accent": style.color }}>
            <span className="chat-class-icon"><ActivityIcon name={suggestion.activity} size={18} /></span>
            <div className="chat-class-info">
                <strong>{suggestion.title}</strong>
                <span><CalendarDays size={12} /> {formatDay(suggestion.date)} · {suggestion.startTime}–{suggestion.endTime}</span>
                <span><User size={12} /> {suggestion.trainer}{suggestion.room ? <> · <MapPin size={12} /> {suggestion.room}</> : null}</span>
            </div>
            {state === "done" ? (
                <span className="chat-class-done"><Check size={15} /> Booked</span>
            ) : (
                <button type="button" onClick={book} disabled={state === "busy"}>{state === "busy" ? "..." : "Register"}</button>
            )}
        </div>
    );
}

function CoachChat() {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const [source, setSource] = useState(null);
    const [listening, setListening] = useState(false);
    const [voiceLang, setVoiceLang] = useState(() => (readSetting("coach-hebrew", false) ? "he-IL" : "en-US"));
    const [speakReplies, setSpeakReplies] = useState(() => canSpeak && readSetting("coach-speak", false));
    const recognition = useRef(null);
    const endRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, sending]);
    useEffect(() => () => { recognition.current?.abort(); if (canSpeak) window.speechSynthesis.cancel(); }, []);

    function speak(text) {
        if (!canSpeak || !speakReplies) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = hasHebrew(text) ? "he-IL" : "en-US";
        utterance.rate = 1.02;
        window.speechSynthesis.speak(utterance);
    }

    async function send(text) {
        const content = text.trim();
        if (!content || sending) return;
        const next = [...messages, { role: "user", content }];
        setMessages(next);
        setInput("");
        setSending(true);
        try {
            const history = next.slice(-12).map(({ role, content: body }) => ({ role, content: body }));
            const result = await sendCoachMessage(history);
            setSource(result.source === "llm" ? result.model : "offline");
            setMessages(current => [...current, { role: "assistant", content: result.reply, classes: result.classes || [] }]);
            speak(result.reply);
        } catch (error) {
            setMessages(current => [...current, { role: "assistant", content: error.message || "The coach couldn't answer right now. Try again in a moment.", error: true }]);
        } finally {
            setSending(false);
            inputRef.current?.focus();
        }
    }

    function toggleListening() {
        if (!SpeechRecognition) return;
        if (listening) { recognition.current?.stop(); return; }
        const rec = new SpeechRecognition();
        rec.lang = voiceLang;
        rec.interimResults = true;
        rec.continuous = false;
        let finalText = "";
        rec.onresult = event => {
            let interim = "";
            for (let i = event.resultIndex; i < event.results.length; i += 1) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) finalText += transcript; else interim += transcript;
            }
            setInput((finalText + interim).trim());
        };
        rec.onerror = event => {
            if (event.error === "not-allowed" || event.error === "service-not-allowed") toast.error("Allow microphone access in your browser to talk to the coach.");
            else if (event.error !== "aborted" && event.error !== "no-speech") toast.error("Voice input stopped. Try again or type your message.");
        };
        rec.onend = () => {
            setListening(false);
            if (finalText.trim()) send(finalText);
        };
        recognition.current = rec;
        if (canSpeak) window.speechSynthesis.cancel();
        rec.start();
        setListening(true);
    }

    function toggleSpeak() {
        const next = !speakReplies;
        setSpeakReplies(next);
        saveSetting("coach-speak", next);
        if (!next && canSpeak) window.speechSynthesis.cancel();
        toast(next ? "The coach will read answers aloud" : "Voice replies off", { icon: next ? "🔊" : "🔇" });
    }

    function switchLang() {
        const hebrew = voiceLang !== "he-IL";
        setVoiceLang(hebrew ? "he-IL" : "en-US");
        saveSetting("coach-hebrew", hebrew);
    }

    return (
        <div className="chat-page">
            <header className="chat-header">
                <div className="chat-avatar"><Sparkles size={22} /></div>
                <div>
                    <h1>AI Coach</h1>
                    <p>{source === null ? "Ask about training, classes or your week." : source === "offline" ? "Offline mode: finding classes from the schedule" : `Powered by ${source}`}</p>
                </div>
                <div className="chat-header-actions">
                    {canSpeak && (
                        <button type="button" className={`chat-icon ${speakReplies ? "on" : ""}`} onClick={toggleSpeak} aria-pressed={speakReplies} title="Read answers aloud" aria-label="Read answers aloud">
                            {speakReplies ? <Volume2 size={18} /> : <VolumeX size={18} />}
                        </button>
                    )}
                    {messages.length > 0 && (
                        <button type="button" className="chat-icon" onClick={() => { setMessages([]); setSource(null); }} title="New conversation" aria-label="Start a new conversation">
                            <RotateCcw size={18} />
                        </button>
                    )}
                </div>
            </header>

            <div className="chat-log" aria-live="polite">
                {messages.length === 0 && (
                    <div className="chat-welcome">
                        <div className="chat-avatar big"><Sparkles size={30} /></div>
                        <h2>Hi! I'm your coach.</h2>
                        <p>I know the gym's schedule and the classes you've taken. Ask me anything, type or tap the mic and talk. You can write in English or Hebrew.</p>
                        <div className="chat-starters">
                            {STARTERS.map(starter => <button key={starter} type="button" dir="auto" onClick={() => send(starter)}>{starter}</button>)}
                        </div>
                    </div>
                )}
                {messages.map((message, index) => (
                    <div key={index} className={`chat-row ${message.role}`}>
                        {message.role === "assistant" && <div className="chat-avatar small"><Sparkles size={14} /></div>}
                        <div className={`chat-bubble ${message.error ? "error" : ""}`}>
                            <p dir="auto">{message.content}</p>
                            {message.classes?.length > 0 && (
                                <div className="chat-classes">{message.classes.map(item => <ClassCard key={item.classId} suggestion={item} />)}</div>
                            )}
                        </div>
                    </div>
                ))}
                {sending && (
                    <div className="chat-row assistant">
                        <div className="chat-avatar small"><Sparkles size={14} /></div>
                        <div className="chat-bubble typing" aria-label="The coach is typing"><i /><i /><i /></div>
                    </div>
                )}
                <div ref={endRef} />
            </div>

            <form className="chat-input" onSubmit={event => { event.preventDefault(); send(input); }}>
                {SpeechRecognition && (
                    <>
                        <button type="button" className="chat-lang" onClick={switchLang} title="Voice language" aria-label={`Voice language: ${voiceLang === "he-IL" ? "Hebrew" : "English"}. Switch`}>
                            {voiceLang === "he-IL" ? "עב" : "EN"}
                        </button>
                        <button type="button" className={`chat-mic ${listening ? "listening" : ""}`} onClick={toggleListening} aria-pressed={listening}
                            aria-label={listening ? "Stop listening" : "Talk to the coach"} title={listening ? "Stop listening" : "Talk to the coach"}>
                            {listening ? <MicOff size={20} /> : <Mic size={20} />}
                        </button>
                    </>
                )}
                <label className="visually-hidden" htmlFor="coach-message">Message the coach</label>
                <textarea
                    id="coach-message"
                    ref={inputRef}
                    dir="auto"
                    rows={1}
                    maxLength={800}
                    placeholder={listening ? "Listening..." : "Ask your coach anything"}
                    value={input}
                    onChange={event => setInput(event.target.value)}
                    onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(input); } }}
                />
                <button type="submit" className="chat-send" disabled={!input.trim() || sending} aria-label="Send">
                    <Send size={18} />
                </button>
            </form>
            <p className="chat-note">The coach gives general fitness guidance, not medical advice.</p>
        </div>
    );
}

export default CoachChat;
