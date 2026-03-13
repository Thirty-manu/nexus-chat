import { useState, useRef, useEffect } from "react";
import { db, auth, googleProvider } from "../firebase";
import {
  collection, addDoc, onSnapshot, query, orderBy,
  serverTimestamp, doc, updateDoc, deleteDoc, setDoc, getDoc,
} from "firebase/firestore";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";

const SUPER_ADMIN = "serem695@gmail.com";

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
  const [banned, setBanned] = useState(false);
  const [activeChannel, setActiveChannel] = useState("general");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [showEmoji, setShowEmoji] = useState(null);
  const [hoveredMsg, setHoveredMsg] = useState(null);
  const [search, setSearch] = useState("");
  const [notification, setNotification] = useState(null);
  const [loading, setLoading] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [confirmBan, setConfirmBan] = useState(null);
  const bottomRef = useRef(null);
  const isAdmin = user?.email === SUPER_ADMIN;

  // Auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const banSnap = await getDoc(doc(db, "banned", firebaseUser.uid));
        if (banSnap.exists()) { setBanned(true); setUser(firebaseUser); setAuthLoading(false); return; }
        await setDoc(doc(db, "users", firebaseUser.uid), {
          uid: firebaseUser.uid, name: firebaseUser.displayName,
          email: firebaseUser.email, photo: firebaseUser.photoURL,
          lastSeen: serverTimestamp(),
        }, { merge: true });
      }
      setUser(firebaseUser);
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // Messages
  useEffect(() => {
    if (!user || banned) return;
    setLoading(true);
    const q = query(collection(db, "channels", activeChannel, "messages"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, [activeChannel, user, banned]);

  // All users (admin only)
  useEffect(() => {
    if (!isAdmin) return;
    return onSnapshot(collection(db, "users"), (snap) => {
      setAllUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [isAdmin]);

  // Online users from messages
  useEffect(() => {
    const seen = new Map();
    messages.forEach((m) => { if (!seen.has(m.userId)) seen.set(m.userId, { name: m.userName, photo: m.userPhoto, id: m.userId }); });
    setOnlineUsers([...seen.values()].slice(0, 6));
  }, [messages]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const showNotif = (msg, type = "info") => { setNotification({ msg, type }); setTimeout(() => setNotification(null), 3000); };

  const handleLogin = async () => { try { await signInWithPopup(auth, googleProvider); } catch (e) { console.error(e); } };
  const handleSignOut = async () => { await signOut(auth); setMessages([]); setSidebarOpen(false); };

  const sendMessage = async () => {
    if (!input.trim() || !user) return;
    const text = input.trim(); setInput("");
    await addDoc(collection(db, "channels", activeChannel, "messages"), {
      userId: user.uid, userName: user.displayName, userPhoto: user.photoURL,
      text, createdAt: serverTimestamp(), reactions: {},
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

  const deleteMessage = async (msgId) => {
    await deleteDoc(doc(db, "channels", activeChannel, "messages", msgId));
    showNotif("Message deleted", "success");
  };

  const banUser = async (target) => {
    await setDoc(doc(db, "banned", target.uid || target.id), {
      uid: target.uid || target.id, name: target.name,
      email: target.email || "", bannedAt: serverTimestamp(), bannedBy: user.email,
    });
    for (const ch of CHANNELS) {
      const snap = await new Promise((res) => {
        const u = onSnapshot(query(collection(db, "channels", ch.id, "messages")), (s) => { u(); res(s); });
      });
      for (const d of snap.docs) {
        if (d.data().userId === (target.uid || target.id)) await deleteDoc(d.ref);
      }
    }
    setConfirmBan(null);
    showNotif(`${target.name} has been removed`, "success");
  };

  const formatTime = (ts) => {
    if (!ts) return "";
    return (ts.toDate ? ts.toDate() : new Date(ts)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const currentChannel = CHANNELS.find((c) => c.id === activeChannel);
  const filteredMsgs = messages.filter((m) => search ? m.text?.toLowerCase().includes(search.toLowerCase()) : true);

  // Loading
  if (authLoading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#070d1a" }}>
      <div style={S.spinner} />
    </div>
  );

  // Banned
  if (banned) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", background: "#070d1a", fontFamily: "'Plus Jakarta Sans',sans-serif", padding: 20, textAlign: "center" }}>
      <div style={{ fontSize: 56, marginBottom: 14 }}>🚫</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: "#ef4444", marginBottom: 8 }}>Access Denied</div>
      <div style={{ fontSize: 14, color: "#64748b", marginBottom: 24 }}>You have been removed from NexusChat.</div>
      <button onClick={() => signOut(auth)} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 10, padding: "10px 24px", color: "#94a3b8", cursor: "pointer", fontSize: 14, fontFamily: "inherit" }}>Sign Out</button>
    </div>
  );

  // Login
  if (!user) return (
    <div style={S.loginRoot}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        .lcard { animation: fadeUp 0.5s ease; }
        .gbtn:hover { transform: scale(1.03); filter: brightness(1.1); }
      `}</style>
      <div className="lcard" style={S.loginCard}>
        <div style={S.loginLogo}>⚡</div>
        <h1 style={S.loginTitle}>NexusChat</h1>
        <p style={{ fontSize: 13, color: "#475569", marginBottom: 22, textAlign: "center" }}>Realtime messaging for your team</p>
        <div style={S.featureList}>
          {["🔥 Realtime", "🌐 4 Channels", "😊 Reactions", "👑 Admin"].map((f) => (
            <div key={f} style={S.featureItem}>{f}</div>
          ))}
        </div>
        <button className="gbtn" style={S.googleBtn} onClick={handleLogin}>
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          <span>Continue with Google</span>
        </button>
      </div>
    </div>
  );

  // Main Chat
  return (
    <div style={S.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
        @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-5px)} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes notifIn { from{opacity:0;transform:translateY(-20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .ma { animation: fadeIn 0.25s ease forwards; }
        .chi:hover { background: rgba(255,255,255,0.06) !important; }
        .sbtn:hover { transform: scale(1.08) !important; filter: brightness(1.2); }
        .rc:hover { transform: scale(1.12); }
        .eo:hover { transform: scale(1.3); background: rgba(255,255,255,0.1); border-radius: 6px; }
        .ib:hover { opacity: 1 !important; }
        .sob:hover { background: rgba(239,68,68,0.15) !important; color: #ef4444 !important; }
        .ab:hover { background: rgba(239,68,68,0.2) !important; }

        /* ── Mobile ── */
        .sidebar {
          width: 255px;
          background: #0a0f1e;
          border-right: 1px solid rgba(255,255,255,0.05);
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
          overflow-y: auto;
          transition: transform 0.3s ease;
          z-index: 50;
        }
        @media (max-width: 640px) {
          .sidebar {
            position: fixed !important;
            top: 0; left: 0;
            height: 100vh;
            transform: translateX(-100%);
            box-shadow: 4px 0 24px rgba(0,0,0,0.6);
          }
          .sidebar.open {
            transform: translateX(0);
          }
          .overlay {
            display: block !important;
          }
          .msg-bubble {
            max-width: 80% !important;
          }
        }
        .overlay {
          display: none;
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.55);
          z-index: 40;
          backdrop-filter: blur(3px);
        }
      `}</style>

      {/* Notification */}
      {notification && (
        <div style={{ ...S.notif, borderColor: notification.type === "error" ? "rgba(239,68,68,0.4)" : notification.type === "success" ? "rgba(34,197,94,0.4)" : "rgba(139,92,246,0.4)" }}>
          <span>{notification.type === "error" ? "❌" : notification.type === "success" ? "✅" : "🔔"}</span>
          <span style={{ fontSize: 13 }}>{notification.msg}</span>
        </div>
      )}

      {/* Mobile overlay */}
      <div className="overlay" onClick={() => setSidebarOpen(false)} />

      {/* Confirm ban */}
      {confirmBan && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#0f172a", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 18, padding: 28, maxWidth: 320, width: "100%", textAlign: "center", fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>🚫</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#e2e8f0", marginBottom: 8 }}>Remove User?</div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20 }}>
              <span style={{ color: "#ef4444", fontWeight: 700 }}>{confirmBan.name}</span> will be silently removed and won't be able to rejoin.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button onClick={() => setConfirmBan(null)} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 10, padding: "9px 20px", color: "#94a3b8", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>Cancel</button>
              <button onClick={() => banUser(confirmBan)} style={{ background: "linear-gradient(135deg,#ef4444,#dc2626)", border: "none", borderRadius: 10, padding: "9px 20px", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}>Remove</button>
            </div>
          </div>
        </div>
      )}

      {/* Admin panel */}
      {showAdminPanel && isAdmin && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#0f172a", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 20, padding: 22, width: "100%", maxWidth: 400, maxHeight: "85vh", overflowY: "auto", fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#e2e8f0" }}>👑 Admin Panel</div>
              <button onClick={() => setShowAdminPanel(false)} style={{ background: "rgba(255,255,255,0.05)", border: "none", borderRadius: 8, width: 30, height: 30, cursor: "pointer", color: "#64748b", fontSize: 16 }}>✕</button>
            </div>
            <div style={{ fontSize: 11, color: "#475569", marginBottom: 10, fontWeight: 700, letterSpacing: "0.1em" }}>ALL USERS ({allUsers.filter(u => u.email !== SUPER_ADMIN).length})</div>
            {allUsers.filter(u => u.email !== SUPER_ADMIN).map((u) => (
              <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 10, marginBottom: 6, border: "1px solid rgba(255,255,255,0.05)" }}>
                {u.photo
                  ? <img src={u.photo} style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} alt="" />
                  : <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg,#667eea,#764ba2)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, flexShrink: 0 }}>{u.name?.[0]}</div>
                }
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</div>
                  <div style={{ fontSize: 11, color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.email}</div>
                </div>
                <button className="ab" onClick={() => setConfirmBan(u)}
                  style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "5px 11px", color: "#ef4444", cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: "inherit", transition: "background 0.15s", whiteSpace: "nowrap" }}>
                  Remove
                </button>
              </div>
            ))}
            {allUsers.filter(u => u.email !== SUPER_ADMIN).length === 0 && (
              <div style={{ color: "#334155", fontSize: 13, textAlign: "center", padding: "20px 0" }}>No users yet — ask users to sign out and back in</div>
            )}
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside className={`sidebar${sidebarOpen ? " open" : ""}`}>
        <div style={S.wsHeader}>
          <div style={S.wsIcon}>⚡</div>
          <div style={{ flex: 1 }}>
            <div style={S.wsName}>NexusChat {isAdmin && <span style={{ fontSize: 10, color: "#f59e0b" }}>👑</span>}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 1 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e", display: "inline-block", animation: "pulse 2s infinite" }} />
              <span style={{ fontSize: 10, color: "#475569" }}>Live · Firebase</span>
            </div>
          </div>
          {isAdmin && (
            <button onClick={() => { setShowAdminPanel(true); setSidebarOpen(false); }}
              style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)", border: "none", borderRadius: 8, padding: "4px 9px", color: "#fff", cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: "inherit", whiteSpace: "nowrap" }}>
              👑 Admin
            </button>
          )}
        </div>

        <div style={S.searchBox}>
          <span style={{ opacity: 0.4, fontSize: 12 }}>🔍</span>
          <input style={S.searchInput} placeholder="Search messages..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div style={S.secLabel}>CHANNELS</div>
        {CHANNELS.map((ch) => {
          const active = activeChannel === ch.id;
          return (
            <div key={ch.id} className="chi" onClick={() => { setActiveChannel(ch.id); setSearch(""); setSidebarOpen(false); }}
              style={{ ...S.chItem, background: active ? "rgba(139,92,246,0.15)" : "transparent", borderLeft: active ? "3px solid #8b5cf6" : "3px solid transparent" }}>
              <span style={{ fontSize: 15 }}>{ch.icon}</span>
              <span style={{ flex: 1, color: active ? "#c4b5fd" : "#64748b", fontWeight: active ? 700 : 500, fontSize: 13 }}>{ch.name}</span>
            </div>
          );
        })}

        {onlineUsers.length > 0 && <>
          <div style={S.secLabel}>RECENTLY ACTIVE</div>
          {onlineUsers.map((u) => (
            <div key={u.id} className="chi" style={S.chItem}>
              {u.photo
                ? <img src={u.photo} style={{ width: 24, height: 24, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} alt="" />
                : <div style={{ ...S.miniAv, background: "linear-gradient(135deg,#667eea,#764ba2)" }}>{u.name?.[0]}</div>
              }
              <span style={{ flex: 1, color: "#64748b", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</span>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
            </div>
          ))}
        </>}

        <div style={S.userBar}>
          {user.photoURL
            ? <img src={user.photoURL} style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(139,92,246,0.5)", flexShrink: 0 }} alt="" />
            : <div style={{ ...S.miniAv, width: 30, height: 30, background: "linear-gradient(135deg,#667eea,#764ba2)" }}>{user.displayName?.[0]}</div>
          }
          <div style={{ flex: 1, overflow: "hidden" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.displayName}</div>
            <div style={{ fontSize: 10, color: "#22c55e" }}>● Online</div>
          </div>
          <button className="sob" onClick={handleSignOut}
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 7, padding: "4px 8px", cursor: "pointer", fontSize: 11, color: "#64748b", transition: "all 0.15s", whiteSpace: "nowrap", fontFamily: "inherit" }}>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={S.main}>
        {/* Header */}
        <header style={S.header}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <button onClick={() => setSidebarOpen(!sidebarOpen)}
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 16, color: "#94a3b8", flexShrink: 0 }}>
              ☰
            </button>
            <span style={{ fontSize: 18 }}>{currentChannel?.icon}</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#e2e8f0" }}>{currentChannel?.name}</div>
              <div style={{ fontSize: 10, color: "#475569" }}>{currentChannel?.desc}</div>
            </div>
          </div>
          <div style={S.livePill}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e", animation: "pulse 2s infinite" }} />
            <span style={{ fontSize: 10, color: "#22c55e", fontWeight: 700 }}>LIVE</span>
          </div>
        </header>

        {/* Messages */}
        <div style={S.msgArea}>
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 10 }}>
              <div style={S.spinner} />
              <div style={{ color: "#475569", fontSize: 13 }}>Loading messages...</div>
            </div>
          ) : (
            <>
              <div style={S.welcomeBlock}>
                <div style={{ fontSize: 34, marginBottom: 6 }}>{currentChannel?.icon}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#e2e8f0", marginBottom: 3 }}>#{currentChannel?.name}</div>
                <div style={{ fontSize: 11, color: "#475569" }}>Powered by Firebase 🔥</div>
              </div>

              {filteredMsgs.map((msg, idx) => {
                const isMe = msg.userId === user.uid;
                const grouped = idx > 0 && filteredMsgs[idx - 1].userId === msg.userId;
                return (
                  <div key={msg.id} className="ma"
                    style={{ display: "flex", flexDirection: isMe ? "row-reverse" : "row", alignItems: "flex-end", gap: 7, marginTop: grouped ? 2 : 14, position: "relative" }}
                    onMouseEnter={() => setHoveredMsg(msg.id)}
                    onMouseLeave={() => { setHoveredMsg(null); setShowEmoji(null); }}
                  >
                    <div style={{ flexShrink: 0, opacity: grouped ? 0 : 1 }}>
                      {msg.userPhoto
                        ? <img src={msg.userPhoto} style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} alt="" />
                        : <div style={{ ...S.av, background: "linear-gradient(135deg,#667eea,#764ba2)" }}>{msg.userName?.[0]}</div>
                      }
                    </div>

                    <div className="msg-bubble" style={{ maxWidth: "70%", display: "flex", flexDirection: "column", alignItems: isMe ? "flex-end" : "flex-start" }}>
                      {!grouped && (
                        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 3, flexDirection: isMe ? "row-reverse" : "row" }}>
                          <span style={{ fontWeight: 700, fontSize: 12, color: isMe ? "#c4b5fd" : "#94a3b8" }}>{isMe ? "You" : msg.userName}</span>
                          <span style={{ color: "#334155", fontSize: 10 }}>{formatTime(msg.createdAt)}</span>
                        </div>
                      )}
                      <div style={{ padding: "9px 13px", borderRadius: isMe ? "16px 3px 16px 16px" : "3px 16px 16px 16px", background: isMe ? "linear-gradient(135deg,#667eea,#764ba2)" : "rgba(255,255,255,0.06)", border: isMe ? "none" : "1px solid rgba(255,255,255,0.07)", color: "#e2e8f0", fontSize: 14, lineHeight: 1.55, wordBreak: "break-word", boxShadow: isMe ? "0 3px 12px rgba(102,126,234,0.3)" : "none" }}>
                        {msg.text}
                      </div>

                      {Object.entries(msg.reactions || {}).length > 0 && (
                        <div style={{ display: "flex", gap: 3, marginTop: 4, flexWrap: "wrap", justifyContent: isMe ? "flex-end" : "flex-start" }}>
                          {Object.entries(msg.reactions).map(([emoji, count]) => (
                            <span key={emoji} className="rc" onClick={() => addReaction(msg.id, emoji)}
                              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: "2px 7px", fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3, transition: "transform 0.1s" }}>
                              {emoji} <span style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8" }}>{count}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {hoveredMsg === msg.id && (
                      <div style={{ position: "absolute", top: -13, [isMe ? "left" : "right"]: 40, display: "flex", gap: 3, zIndex: 10 }}>
                        <button style={S.hoverBtn} onClick={() => setShowEmoji(showEmoji === msg.id ? null : msg.id)}>😊</button>
                        {isAdmin && (
                          <button style={{ ...S.hoverBtn, color: "#ef4444" }} onClick={() => deleteMessage(msg.id)}>🗑️</button>
                        )}
                      </div>
                    )}

                    {showEmoji === msg.id && (
                      <div style={{ ...S.emojiPanel, [isMe ? "left" : "right"]: 40, bottom: 32 }}>
                        {EMOJI_LIST.map((e) => (
                          <span key={e} className="eo" onClick={() => addReaction(msg.id, e)}
                            style={{ fontSize: 18, cursor: "pointer", padding: 3, display: "inline-block", transition: "transform 0.1s" }}>{e}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {filteredMsgs.length === 0 && !loading && (
                <div style={{ textAlign: "center", color: "#334155", fontSize: 13, marginTop: 32 }}>No messages yet · Say something! 👋</div>
              )}
            </>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={S.inputArea}>
          <div style={S.inputBox}>
            <input style={S.input} placeholder={`Message #${activeChannel}...`} value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()} />
            <button className="ib" style={{ ...S.iconBtn }} onClick={() => setInput(input + "😊")}>😊</button>
            <button className="sbtn" style={{ ...S.sendBtn, opacity: input.trim() ? 1 : 0.4 }} onClick={sendMessage}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

const S = {
  root: { display: "flex", height: "100vh", fontFamily: "'Plus Jakarta Sans',sans-serif", background: "#070d1a", color: "#e2e8f0", overflow: "hidden", position: "relative" },
  spinner: { width: 28, height: 28, border: "3px solid rgba(139,92,246,0.2)", borderTop: "3px solid #8b5cf6", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  notif: { position: "fixed", top: 14, right: 14, background: "#0f172a", border: "1px solid", borderRadius: 11, padding: "9px 13px", display: "flex", alignItems: "center", gap: 7, zIndex: 1000, animation: "notifIn 0.3s ease", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", maxWidth: "90vw" },
  loginRoot: { display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'Plus Jakarta Sans',sans-serif", background: "#070d1a", padding: 16 },
  loginCard: { background: "rgba(15,23,42,0.95)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 22, padding: "34px 26px", width: "100%", maxWidth: 340, display: "flex", flexDirection: "column", alignItems: "center", boxShadow: "0 24px 64px rgba(0,0,0,0.6)" },
  loginLogo: { width: 58, height: 58, background: "linear-gradient(135deg,#667eea,#764ba2)", borderRadius: 15, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, marginBottom: 14, boxShadow: "0 8px 28px rgba(102,126,234,0.4)" },
  loginTitle: { fontSize: 26, fontWeight: 800, color: "#e2e8f0", marginBottom: 6 },
  featureList: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, width: "100%", marginBottom: 24 },
  featureItem: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 9, padding: "7px 10px", fontSize: 11, color: "#64748b", textAlign: "center" },
  googleBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%", padding: "12px", background: "#fff", border: "none", borderRadius: 12, cursor: "pointer", fontSize: 14, fontWeight: 700, color: "#1e293b", fontFamily: "'Plus Jakarta Sans',sans-serif", transition: "transform 0.15s", boxShadow: "0 4px 16px rgba(0,0,0,0.3)" },
  wsHeader: { display: "flex", alignItems: "center", gap: 9, padding: "14px 12px 11px", borderBottom: "1px solid rgba(255,255,255,0.05)" },
  wsIcon: { width: 33, height: 33, background: "linear-gradient(135deg,#667eea,#764ba2)", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 },
  wsName: { fontSize: 13, fontWeight: 800, color: "#e2e8f0" },
  searchBox: { display: "flex", alignItems: "center", gap: 6, margin: "8px 9px 3px", background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "6px 9px", border: "1px solid rgba(255,255,255,0.05)" },
  searchInput: { background: "none", border: "none", outline: "none", color: "#94a3b8", fontSize: 12, fontFamily: "inherit", width: "100%" },
  secLabel: { fontSize: 9, fontWeight: 800, letterSpacing: "0.12em", color: "#1e293b", padding: "10px 13px 3px" },
  chItem: { display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", cursor: "pointer", borderRadius: "0 8px 8px 0", margin: "1px 7px 1px 0", transition: "background 0.15s" },
  miniAv: { width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff", flexShrink: 0 },
  userBar: { marginTop: "auto", display: "flex", alignItems: "center", gap: 7, padding: "10px 11px", borderTop: "1px solid rgba(255,255,255,0.05)", background: "rgba(0,0,0,0.2)" },
  main: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#070d1a", minWidth: 0 },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 13px", height: 54, borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(10,15,30,0.9)", backdropFilter: "blur(10px)", flexShrink: 0 },
  livePill: { display: "flex", alignItems: "center", gap: 4, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 20, padding: "3px 9px" },
  msgArea: { flex: 1, overflowY: "auto", padding: "0 13px 10px" },
  welcomeBlock: { textAlign: "center", padding: "24px 0 18px", borderBottom: "1px solid rgba(255,255,255,0.04)", marginBottom: 16 },
  av: { width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, color: "#fff" },
  hoverBtn: { background: "rgba(15,23,42,0.95)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 7, padding: "3px 7px", cursor: "pointer", fontSize: 12, color: "#e2e8f0" },
  emojiPanel: { position: "absolute", background: "#0f172a", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 12, padding: "6px 8px", display: "flex", flexWrap: "wrap", gap: 2, zIndex: 100, width: 196, boxShadow: "0 12px 40px rgba(0,0,0,0.6)" },
  inputArea: { padding: "8px 12px 10px", borderTop: "1px solid rgba(255,255,255,0.05)", background: "rgba(10,15,30,0.9)", backdropFilter: "blur(10px)", flexShrink: 0 },
  inputBox: { display: "flex", alignItems: "center", background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: "3px 5px 3px 13px", border: "1px solid rgba(255,255,255,0.07)", gap: 4 },
  iconBtn: { background: "transparent", border: "none", borderRadius: 7, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 16, opacity: 0.6, transition: "opacity 0.15s", flexShrink: 0 },
  input: { flex: 1, background: "transparent", border: "none", outline: "none", color: "#e2e8f0", fontSize: 14, fontFamily: "inherit", padding: "8px 0", minWidth: 0 },
  sendBtn: { background: "linear-gradient(135deg,#667eea,#764ba2)", border: "none", borderRadius: 9, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", transition: "transform 0.15s", flexShrink: 0, boxShadow: "0 3px 10px rgba(102,126,234,0.4)" },
};