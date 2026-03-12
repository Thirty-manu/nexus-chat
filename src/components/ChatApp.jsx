import { useState, useRef, useEffect } from "react";
import { db, auth, googleProvider } from "../firebase";
import {
  collection, addDoc, onSnapshot,
  query, orderBy, serverTimestamp, doc, updateDoc,
} from "firebase/firestore";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";

const CHANNELS = [
  { id: "general", name: "general", icon: "🌐", desc: "Company-wide announcements" },
  { id: "design", name: "design", icon: "🎨", desc: "UI/UX discussions" },
  { id: "dev", name: "dev", icon: "💻", desc: "Engineering talk" },
  { id: "random", name: "random", icon: "🎲", desc: "Off-topic fun" },
];

const EMOJI_LIST = ["👍", "❤️", "🔥", "😂", "😱", "✅", "🚀", "🎨", "👏", "💯", "🙌", "😎"];

export default function ChatApp() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeChannel, setActiveChannel] = useState("general");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [showEmoji, setShowEmoji] = useState(null);
  const [hoveredMsg, setHoveredMsg] = useState(null);
  const [typing, setTyping] = useState(false);
  const [search, setSearch] = useState("");
  const [notification, setNotification] = useState(null);
  const [loading, setLoading] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // Auth state listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // Firestore messages listener
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const q = query(
      collection(db, "channels", activeChannel, "messages"),
      orderBy("createdAt", "asc")
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setMessages(msgs);
      setLoading(false);
    });
    return () => unsub();
  }, [activeChannel, user]);

  // Track online users from recent messages
  useEffect(() => {
    const users = [...new Map(messages.map((m) => [m.userId, { name: m.userName, photo: m.userPhoto }])).entries()]
      .map(([id, info]) => ({ id, ...info }))
      .slice(0, 5);
    setOnlineUsers(users);
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const showNotif = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Login error:", err);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setMessages([]);
  };

  const sendMessage = async () => {
    if (!input.trim() || !user) return;
    const text = input.trim();
    setInput("");

    await addDoc(collection(db, "channels", activeChannel, "messages"), {
      userId: user.uid,
      userName: user.displayName,
      userPhoto: user.photoURL,
      text,
      createdAt: serverTimestamp(),
      reactions: {},
    });
  };

  const addReaction = async (msgId, emoji) => {
    const msg = messages.find((m) => m.id === msgId);
    if (!msg) return;
    const reactions = { ...(msg.reactions || {}) };
    reactions[emoji] = (reactions[emoji] || 0) + 1;
    await updateDoc(doc(db, "channels", activeChannel, "messages", msgId), { reactions });
    setShowEmoji(null);
  };

  const formatTime = (ts) => {
    if (!ts) return "";
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const currentChannel = CHANNELS.find((c) => c.id === activeChannel);
  const filteredMsgs = messages.filter((m) =>
    search ? m.text?.toLowerCase().includes(search.toLowerCase()) : true
  );

  // ─── Loading screen ───
  if (authLoading) {
    return (
      <div style={{ ...styles.root, alignItems: "center", justifyContent: "center" }}>
        <div style={styles.spinner} />
      </div>
    );
  }

  // ─── Login screen ───
  if (!user) {
    return (
      <div style={styles.loginRoot}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
          * { box-sizing: border-box; margin: 0; padding: 0; }
          @keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
          @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
          @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
          .login-card { animation: fadeUp 0.5s ease forwards; }
          .google-btn:hover { transform: scale(1.03) !important; filter: brightness(1.1); }
        `}</style>

        {/* Background blobs */}
        <div style={{ position: "absolute", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(102,126,234,0.15), transparent)", top: -100, right: -100, pointerEvents: "none" }} />
        <div style={{ position: "absolute", width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle, rgba(118,75,162,0.12), transparent)", bottom: -80, left: -80, pointerEvents: "none" }} />

        <div className="login-card" style={styles.loginCard}>
          {/* Logo */}
          <div style={styles.loginLogo}>
            <span style={{ fontSize: 32 }}>⚡</span>
          </div>
          <h1 style={styles.loginTitle}>NexusChat</h1>
          <p style={styles.loginSub}>Realtime messaging for your team</p>

          {/* Features */}
          <div style={styles.featureList}>
            {["🔥 Realtime messages", "🌐 Multiple channels", "😊 Emoji reactions", "📱 Works on any device"].map((f) => (
              <div key={f} style={styles.featureItem}>{f}</div>
            ))}
          </div>

          {/* Google Sign In Button */}
          <button className="google-btn" style={styles.googleBtn} onClick={handleGoogleLogin}>
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span>Continue with Google</span>
          </button>

          <p style={{ fontSize: 11, color: "#334155", marginTop: 16, textAlign: "center" }}>
            By signing in you agree to our terms of service
          </p>
        </div>
      </div>
    );
  }

  // ─── Main Chat ───
  return (
    <div style={styles.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-5px)} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes notifIn { from{opacity:0;transform:translateY(-20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .msg-anim { animation: fadeIn 0.25s ease forwards; }
        .ch-item:hover { background: rgba(255,255,255,0.06) !important; }
        .send-btn:hover { transform: scale(1.08) !important; filter: brightness(1.2); }
        .react-chip:hover { transform: scale(1.12); }
        .emoji-opt:hover { transform: scale(1.3); background: rgba(255,255,255,0.1); border-radius: 6px; }
        .icon-btn:hover { opacity: 1 !important; background: rgba(255,255,255,0.08) !important; }
        .signout-btn:hover { background: rgba(239,68,68,0.15) !important; color: #ef4444 !important; }
      `}</style>

      {notification && (
        <div style={styles.notif}>
          <span>🔔</span>
          <span style={{ fontSize: 13 }}>{notification}</span>
        </div>
      )}

      {/* Sidebar */}
      <aside style={styles.sidebar}>
        <div style={styles.wsHeader}>
          <div style={styles.wsIcon}>⚡</div>
          <div>
            <div style={styles.wsName}>NexusChat</div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block", animation: "pulse 2s infinite" }} />
              <span style={{ fontSize: 11, color: "#475569" }}>Live · Firebase 🔥</span>
            </div>
          </div>
        </div>

        <div style={styles.searchBox}>
          <span style={{ opacity: 0.4, fontSize: 13 }}>🔍</span>
          <input style={styles.searchInput} placeholder="Search messages..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div style={styles.secLabel}>CHANNELS</div>
        {CHANNELS.map((ch) => {
          const active = activeChannel === ch.id;
          return (
            <div key={ch.id} className="ch-item" onClick={() => { setActiveChannel(ch.id); setSearch(""); }}
              style={{ ...styles.chItem, background: active ? "rgba(139,92,246,0.15)" : "transparent", borderLeft: active ? "3px solid #8b5cf6" : "3px solid transparent" }}>
              <span style={{ fontSize: 15 }}>{ch.icon}</span>
              <span style={{ flex: 1, color: active ? "#c4b5fd" : "#64748b", fontWeight: active ? 700 : 500, fontSize: 13 }}>{ch.name}</span>
            </div>
          );
        })}

        {/* Online users */}
        {onlineUsers.length > 0 && (
          <>
            <div style={styles.secLabel}>RECENTLY ACTIVE</div>
            {onlineUsers.map((u) => (
              <div key={u.id} className="ch-item" style={styles.chItem}>
                {u.photo ? (
                  <img src={u.photo} style={{ width: 26, height: 26, borderRadius: "50%", objectFit: "cover" }} alt="" />
                ) : (
                  <div style={{ ...styles.miniAv, background: "linear-gradient(135deg,#667eea,#764ba2)" }}>{u.name?.[0]}</div>
                )}
                <span style={{ flex: 1, color: "#64748b", fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</span>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
              </div>
            ))}
          </>
        )}

        {/* User footer */}
        <div style={styles.userBar}>
          {user.photoURL ? (
            <img src={user.photoURL} style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(139,92,246,0.5)" }} alt="" />
          ) : (
            <div style={{ ...styles.miniAv, width: 32, height: 32, background: "linear-gradient(135deg,#667eea,#764ba2)" }}>{user.displayName?.[0]}</div>
          )}
          <div style={{ flex: 1, overflow: "hidden" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.displayName}</div>
            <div style={{ fontSize: 10, color: "#22c55e" }}>● Online</div>
          </div>
          <button className="signout-btn" onClick={handleSignOut}
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 7, padding: "4px 8px", cursor: "pointer", fontSize: 11, color: "#64748b", transition: "all 0.15s", whiteSpace: "nowrap" }}>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={styles.main}>
        <header style={styles.header}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 20 }}>{currentChannel?.icon}</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#e2e8f0" }}>{currentChannel?.name}</div>
              <div style={{ fontSize: 11, color: "#475569" }}>{currentChannel?.desc}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={styles.livePill}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", animation: "pulse 2s infinite" }} />
              <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 700 }}>LIVE</span>
            </div>
            <div style={{ fontSize: 13, color: "#475569" }}>
              Hi, <span style={{ color: "#c4b5fd", fontWeight: 700 }}>{user.displayName?.split(" ")[0]}</span> 👋
            </div>
          </div>
        </header>

        <div style={styles.msgArea}>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12 }}>
              <div style={styles.spinner} />
              <div style={{ color: "#475569", fontSize: 14 }}>Loading messages...</div>
            </div>
          ) : (
            <>
              <div style={styles.welcomeBlock}>
                <div style={{ fontSize: 44, marginBottom: 6 }}>{currentChannel?.icon}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#e2e8f0", marginBottom: 4 }}>Welcome to #{currentChannel?.name}</div>
                <div style={{ fontSize: 13, color: "#475569" }}>Start the conversation · Powered by Firebase 🔥</div>
              </div>

              {filteredMsgs.map((msg, idx) => {
                const isMe = msg.userId === user.uid;
                const grouped = idx > 0 && filteredMsgs[idx - 1].userId === msg.userId;
                return (
                  <div key={msg.id} className="msg-anim"
                    style={{ display: "flex", flexDirection: isMe ? "row-reverse" : "row", alignItems: "flex-end", gap: 10, marginTop: grouped ? 3 : 18, position: "relative" }}
                    onMouseEnter={() => setHoveredMsg(msg.id)}
                    onMouseLeave={() => { setHoveredMsg(null); setShowEmoji(null); }}
                  >
                    {/* Avatar */}
                    <div style={{ flexShrink: 0, opacity: grouped ? 0 : 1 }}>
                      {msg.userPhoto ? (
                        <img src={msg.userPhoto} style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }} alt="" />
                      ) : (
                        <div style={{ ...styles.av, background: "linear-gradient(135deg,#667eea,#764ba2)" }}>{msg.userName?.[0]}</div>
                      )}
                    </div>

                    <div style={{ maxWidth: "60%", display: "flex", flexDirection: "column", alignItems: isMe ? "flex-end" : "flex-start" }}>
                      {!grouped && (
                        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4, flexDirection: isMe ? "row-reverse" : "row" }}>
                          <span style={{ fontWeight: 700, fontSize: 13, color: isMe ? "#c4b5fd" : "#94a3b8" }}>{isMe ? "You" : msg.userName}</span>
                          <span style={{ color: "#334155", fontSize: 11 }}>{formatTime(msg.createdAt)}</span>
                        </div>
                      )}
                      <div style={{ padding: "10px 15px", borderRadius: isMe ? "18px 4px 18px 18px" : "4px 18px 18px 18px", background: isMe ? "linear-gradient(135deg, #667eea, #764ba2)" : "rgba(255,255,255,0.06)", border: isMe ? "none" : "1px solid rgba(255,255,255,0.07)", color: "#e2e8f0", fontSize: 14, lineHeight: 1.6, wordBreak: "break-word", boxShadow: isMe ? "0 4px 20px rgba(102,126,234,0.3)" : "none" }}>
                        {msg.text}
                      </div>

                      {Object.entries(msg.reactions || {}).length > 0 && (
                        <div style={{ display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap", justifyContent: isMe ? "flex-end" : "flex-start" }}>
                          {Object.entries(msg.reactions).map(([emoji, count]) => (
                            <span key={emoji} className="react-chip" onClick={() => addReaction(msg.id, emoji)}
                              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: "3px 9px", fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, transition: "transform 0.1s" }}>
                              {emoji} <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8" }}>{count}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {hoveredMsg === msg.id && (
                      <div style={{ position: "absolute", top: -14, [isMe ? "left" : "right"]: 46, display: "flex", gap: 4, zIndex: 10 }}>
                        <button style={styles.hoverBtn} onClick={() => setShowEmoji(showEmoji === msg.id ? null : msg.id)}>😊</button>
                      </div>
                    )}
                    {showEmoji === msg.id && (
                      <div style={{ ...styles.emojiPanel, [isMe ? "left" : "right"]: 46, bottom: 36 }}>
                        {EMOJI_LIST.map((e) => (
                          <span key={e} className="emoji-opt" onClick={() => addReaction(msg.id, e)}
                            style={{ fontSize: 20, cursor: "pointer", padding: 4, display: "inline-block", transition: "transform 0.1s" }}>{e}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {filteredMsgs.length === 0 && !loading && (
                <div style={{ textAlign: "center", color: "#334155", fontSize: 14, marginTop: 40 }}>
                  No messages yet · Be the first to say something! 👋
                </div>
              )}
            </>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={styles.inputArea}>
          <div style={styles.inputBox}>
            <button className="icon-btn" style={{ ...styles.iconBtn, fontSize: 16 }}>📎</button>
            <input ref={inputRef} style={styles.input} placeholder={`Message #${activeChannel}...`} value={input}
              onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage()} />
            <button className="icon-btn" style={{ ...styles.iconBtn, fontSize: 16 }} onClick={() => setInput(input + "😊")}>😊</button>
            <button className="send-btn" style={{ ...styles.sendBtn, opacity: input.trim() ? 1 : 0.4 }} onClick={sendMessage}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
          <div style={{ textAlign: "center", fontSize: 11, color: "#1e293b", marginTop: 5 }}>
            Press <kbd style={{ background: "#1e293b", color: "#64748b", padding: "1px 5px", borderRadius: 4, fontSize: 10 }}>Enter</kbd> to send
          </div>
        </div>
      </main>
    </div>
  );
}

const styles = {
  root: { display: "flex", height: "100vh", fontFamily: "'Plus Jakarta Sans', sans-serif", background: "#070d1a", color: "#e2e8f0", overflow: "hidden", position: "relative" },
  spinner: { width: 32, height: 32, border: "3px solid rgba(139,92,246,0.2)", borderTop: "3px solid #8b5cf6", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  notif: { position: "fixed", top: 18, right: 18, background: "#0f172a", border: "1px solid rgba(139,92,246,0.4)", borderRadius: 12, padding: "10px 16px", display: "flex", alignItems: "center", gap: 8, zIndex: 1000, animation: "notifIn 0.3s ease", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" },

  // Login
  loginRoot: { display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'Plus Jakarta Sans', sans-serif", background: "#070d1a", position: "relative", overflow: "hidden" },
  loginCard: { background: "rgba(15,23,42,0.9)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 24, padding: "40px 36px", width: 380, display: "flex", flexDirection: "column", alignItems: "center", boxShadow: "0 24px 64px rgba(0,0,0,0.6)", backdropFilter: "blur(20px)", position: "relative", zIndex: 1 },
  loginLogo: { width: 64, height: 64, background: "linear-gradient(135deg,#667eea,#764ba2)", borderRadius: 18, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, boxShadow: "0 8px 32px rgba(102,126,234,0.4)" },
  loginTitle: { fontSize: 28, fontWeight: 800, color: "#e2e8f0", marginBottom: 8, letterSpacing: "-0.5px" },
  loginSub: { fontSize: 14, color: "#475569", marginBottom: 24, textAlign: "center" },
  featureList: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, width: "100%", marginBottom: 28 },
  featureItem: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "8px 12px", fontSize: 12, color: "#64748b", textAlign: "center" },
  googleBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%", padding: "13px 20px", background: "#fff", border: "none", borderRadius: 12, cursor: "pointer", fontSize: 15, fontWeight: 700, color: "#1e293b", fontFamily: "'Plus Jakarta Sans', sans-serif", transition: "transform 0.15s", boxShadow: "0 4px 16px rgba(0,0,0,0.3)" },

  // App
  sidebar: { width: 255, background: "#0a0f1e", borderRight: "1px solid rgba(255,255,255,0.05)", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" },
  wsHeader: { display: "flex", alignItems: "center", gap: 10, padding: "16px 14px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)" },
  wsIcon: { width: 36, height: 36, background: "linear-gradient(135deg,#667eea,#764ba2)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 },
  wsName: { fontSize: 14, fontWeight: 800, color: "#e2e8f0" },
  searchBox: { display: "flex", alignItems: "center", gap: 7, margin: "10px 10px 4px", background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "7px 10px", border: "1px solid rgba(255,255,255,0.05)" },
  searchInput: { background: "none", border: "none", outline: "none", color: "#94a3b8", fontSize: 12, fontFamily: "inherit", width: "100%" },
  secLabel: { fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", color: "#1e293b", padding: "12px 14px 4px" },
  chItem: { display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", cursor: "pointer", borderRadius: "0 8px 8px 0", margin: "1px 8px 1px 0", transition: "background 0.15s" },
  miniAv: { width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0 },
  userBar: { marginTop: "auto", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderTop: "1px solid rgba(255,255,255,0.05)", background: "rgba(0,0,0,0.2)" },
  main: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "radial-gradient(ellipse at 80% 0%, rgba(102,126,234,0.05) 0%, transparent 55%), #070d1a" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 22px", height: 60, borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(10,15,30,0.85)", backdropFilter: "blur(10px)", flexShrink: 0 },
  livePill: { display: "flex", alignItems: "center", gap: 5, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 20, padding: "3px 10px" },
  iconBtn: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 14, opacity: 0.6, transition: "opacity 0.15s" },
  msgArea: { flex: 1, overflowY: "auto", padding: "0 26px 12px" },
  welcomeBlock: { textAlign: "center", padding: "32px 0 24px", borderBottom: "1px solid rgba(255,255,255,0.04)", marginBottom: 20 },
  av: { width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, color: "#fff" },
  hoverBtn: { background: "rgba(15,23,42,0.95)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "4px 8px", cursor: "pointer", fontSize: 13, color: "#e2e8f0" },
  emojiPanel: { position: "absolute", background: "#0f172a", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 14, padding: "8px 10px", display: "flex", flexWrap: "wrap", gap: 2, zIndex: 100, width: 216, boxShadow: "0 16px 48px rgba(0,0,0,0.6)" },
  inputArea: { padding: "10px 22px 14px", borderTop: "1px solid rgba(255,255,255,0.05)", background: "rgba(10,15,30,0.9)", backdropFilter: "blur(10px)", flexShrink: 0 },
  inputBox: { display: "flex", alignItems: "center", background: "rgba(255,255,255,0.05)", borderRadius: 13, padding: "4px 5px 4px 8px", border: "1px solid rgba(255,255,255,0.07)", gap: 3 },
  input: { flex: 1, background: "transparent", border: "none", outline: "none", color: "#e2e8f0", fontSize: 14, fontFamily: "inherit", padding: "8px 6px" },
  sendBtn: { background: "linear-gradient(135deg,#667eea,#764ba2)", border: "none", borderRadius: 9, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "transform 0.15s", flexShrink: 0, boxShadow: "0 4px 14px rgba(102,126,234,0.4)" },
};
