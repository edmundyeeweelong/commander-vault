import { useState, useEffect, useRef, useCallback } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, update, get } from "firebase/database";

// ─────────────────────────────────────────────────────────────────────────────
// 🔥 FIREBASE CONFIG — replace with your own from console.firebase.google.com
// ─────────────────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyD6yhem0tA1BkeZNhCfW3NBrGw5pTOGi3U",
  authDomain: "commander-vault.firebaseapp.com",
  databaseURL: "https://commander-vault-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "commander-vault",
  storageBucket: "commander-vault.firebasestorage.app",
  messagingSenderId: "627233738378",
  appId: "1:627233738378:web:8ebc3f3ce441df92a8a773",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// ── Scryfall ──────────────────────────────────────────────────────────────────
async function fetchCommanderCard(name) {
  if (!name.trim()) return null;
  try {
    const res = await fetch(
      `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name.trim())}`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.object === "error") return null;
    const uris = data.image_uris || data.card_faces?.[0]?.image_uris || {};
    return {
      name: data.name,
      image: uris.art_crop || uris.normal || uris.large || null,
      fullImage: uris.large || uris.normal || null,
      colors: data.color_identity || [],
      type: data.type_line || "",
    };
  } catch { return null; }
}

// ── Constants ─────────────────────────────────────────────────────────────────
const colorGlows = { W: "#fffde7", U: "#1565c0", B: "#9c27b0", R: "#c62828", G: "#2e7d32" };
function getGlow(colors) {
  if (!colors?.length) return "#888";
  if (colors.length === 1) return colorGlows[colors[0]] || "#888";
  return "#c9a84c";
}

const COUNTER_TYPES = [
  { key: "poison",     label: "☠ Poison",     color: "#8bc34a" },
  { key: "experience", label: "⚡ Experience", color: "#ffb300" },
  { key: "energy",     label: "⚙ Energy",     color: "#26c6da" },
  { key: "rad",        label: "☢ Rad",        color: "#aed581" },
  { key: "tax",        label: "👑 Tax",        color: "#ef9a9a" },
];

const PLAYER_THEMES = [
  { bg: "rgba(30,10,60,0.92)",  accent: "#a78bfa", border: "#6d28d9" },
  { bg: "rgba(10,30,60,0.92)",  accent: "#60a5fa", border: "#1d4ed8" },
  { bg: "rgba(40,10,10,0.92)",  accent: "#f87171", border: "#b91c1c" },
  { bg: "rgba(10,40,20,0.92)",  accent: "#4ade80", border: "#15803d" },
];

const PLAYER_NAMES = ["Player 1", "Player 2", "Player 3", "Player 4"];
const STARTING_LIFE = 40;

function makePlayer(i) {
  return {
    id: i,
    name: PLAYER_NAMES[i],
    life: STARTING_LIFE,
    counters: { poison: 0, experience: 0, energy: 0, rad: 0, tax: 0 },
    commander: null,
    commanderName: "",
    commanderDamage: [0, 0, 0, 0],
    alive: true,
  };
}

function genRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

// ── Global CSS ────────────────────────────────────────────────────────────────
const globalStyle = `
  @import url('https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@400;700;900&family=Cinzel:wght@400;600;700&family=Lato:wght@300;400&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Lato', sans-serif; background: #080810; color: #e8e0d0; min-height: 100vh; overflow-x: hidden; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: #111; }
  ::-webkit-scrollbar-thumb { background: #4a3080; border-radius: 2px; }

  .rune-bg {
    position: fixed; inset: 0; pointer-events: none; z-index: 0;
    background:
      radial-gradient(ellipse at 20% 20%, rgba(109,40,217,0.12) 0%, transparent 60%),
      radial-gradient(ellipse at 80% 80%, rgba(29,78,216,0.10) 0%, transparent 60%),
      radial-gradient(ellipse at 50% 50%, rgba(185,28,28,0.06) 0%, transparent 70%);
  }
  .rune-svg { position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 0; opacity: 0.04; }
  .app-wrap { position: relative; z-index: 1; min-height: 100vh; }

  .lobby {
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; min-height: 100vh; padding: 32px 24px; gap: 0;
  }
  .lobby-title {
    font-family: 'Cinzel Decorative', cursive; font-weight: 900;
    font-size: clamp(22px, 6vw, 48px); letter-spacing: 0.1em;
    background: linear-gradient(135deg, #a78bfa 0%, #c9a84c 50%, #f87171 100%);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
    text-align: center; margin-bottom: 6px;
  }
  .lobby-sub { font-family: 'Cinzel', serif; font-size: 11px; letter-spacing: 0.3em; color: #a89b7a; text-transform: uppercase; margin-bottom: 40px; }
  .lobby-divider { width: 100%; max-width: 320px; display: flex; align-items: center; gap: 12px; margin: 20px 0; }
  .lobby-divider::before, .lobby-divider::after { content: ''; flex: 1; height: 1px; background: rgba(255,255,255,0.12); }
  .lobby-divider span { font-family: 'Cinzel', serif; font-size: 10px; color: #666; letter-spacing: 0.2em; }
  .lobby-card { width: 100%; max-width: 320px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 24px; display: flex; flex-direction: column; gap: 12px; }
  .lobby-card-title { font-family: 'Cinzel', serif; font-size: 11px; letter-spacing: 0.2em; color: #a89b7a; text-transform: uppercase; text-align: center; margin-bottom: 4px; }
  .lobby-input { width: 100%; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; color: #e8e0d0; font-family: 'Cinzel', serif; font-size: 22px; padding: 12px 16px; outline: none; text-align: center; letter-spacing: 0.3em; text-transform: uppercase; }
  .lobby-input:focus { border-color: rgba(255,255,255,0.4); }
  .lobby-input::placeholder { color: rgba(255,255,255,0.2); font-size: 13px; letter-spacing: 0.15em; }
  .lobby-btn { font-family: 'Cinzel', serif; font-size: 12px; letter-spacing: 0.2em; padding: 12px 24px; border-radius: 8px; border: 1px solid; cursor: pointer; transition: all 0.2s; text-transform: uppercase; text-align: center; }
  .lobby-btn:hover { transform: translateY(-1px); }
  .lobby-btn.primary { border-color: #6d28d9; color: #080810; background: #a78bfa; font-weight: 700; }
  .lobby-btn.primary:hover { background: #c4b5fd; }
  .lobby-btn.secondary { border-color: rgba(255,255,255,0.2); color: #e8e0d0; background: transparent; }
  .lobby-btn.secondary:hover { background: rgba(255,255,255,0.08); }
  .room-code-display { font-family: 'Cinzel Decorative', cursive; font-size: 48px; font-weight: 900; letter-spacing: 0.3em; color: #c9a84c; text-align: center; text-shadow: 0 0 30px rgba(201,168,76,0.5); }
  .room-code-hint { font-family: 'Cinzel', serif; font-size: 10px; color: #666; text-align: center; letter-spacing: 0.15em; }

  .status-bar { display: flex; align-items: center; justify-content: space-between; padding: 6px 14px; background: rgba(0,0,0,0.35); border-bottom: 1px solid rgba(255,255,255,0.06); font-family: 'Cinzel', serif; font-size: 10px; letter-spacing: 0.1em; }
  .status-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; margin-right: 5px; }
  .status-dot.live { background: #4ade80; box-shadow: 0 0 6px #4ade80; animation: blink 2s ease infinite; }
  .status-dot.offline { background: #ef4444; }
  @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }

  .header { text-align: center; padding: 10px 16px 4px; }
  .header h1 { font-family: 'Cinzel Decorative', cursive; font-size: clamp(15px, 3.5vw, 26px); font-weight: 900; letter-spacing: 0.12em; background: linear-gradient(135deg, #a78bfa 0%, #c9a84c 50%, #f87171 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
  .header p { font-family: 'Cinzel', serif; font-size: 10px; letter-spacing: 0.25em; color: #a89b7a; margin-top: 2px; text-transform: uppercase; }

  .view-bar { display: flex; justify-content: center; gap: 5px; padding: 8px 10px; flex-wrap: wrap; }
  .view-btn { font-family: 'Cinzel', serif; font-size: 10px; letter-spacing: 0.1em; padding: 5px 10px; border-radius: 3px; border: 1px solid; cursor: pointer; transition: all 0.2s; background: transparent; text-transform: uppercase; }
  .view-btn:hover { opacity: 0.85; transform: translateY(-1px); }
  .view-btn.active { color: #080810; font-weight: 700; }

  .grid-4 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 0 10px 20px; max-width: 900px; margin: 0 auto; }
  @media (min-width: 700px) { .grid-4 { grid-template-columns: 1fr 1fr 1fr 1fr; } }

  .player-card { border-radius: 12px; border: 1px solid; overflow: hidden; display: flex; flex-direction: column; position: relative; transition: box-shadow 0.3s; min-height: 220px; }
  .player-card.dead { opacity: 0.4; filter: grayscale(0.8); }
  .card-art { position: absolute; inset: 0; background-size: cover; background-position: center; z-index: 0; }
  .card-art-overlay { position: absolute; inset: 0; z-index: 1; }
  .card-inner { position: relative; z-index: 2; display: flex; flex-direction: column; height: 100%; padding: 10px; gap: 6px; }

  .player-name-row { display: flex; align-items: center; gap: 6px; }
  .player-name { font-family: 'Cinzel', serif; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #fff; text-shadow: 0 1px 4px rgba(0,0,0,0.9); flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .edit-name-btn { font-size: 10px; background: rgba(255,255,255,0.12); border: none; border-radius: 3px; color: #ccc; cursor: pointer; padding: 2px 5px; transition: background 0.2s; }
  .edit-name-btn:hover { background: rgba(255,255,255,0.25); }

  .life-section { display: flex; align-items: center; justify-content: center; gap: 8px; margin: auto 0; position: relative; }
  .life-btn { width: 36px; height: 36px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.3); background: rgba(0,0,0,0.5); color: #fff; font-size: 22px; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; justify-content: center; user-select: none; -webkit-user-select: none; }
  .life-btn:hover { transform: scale(1.15); background: rgba(0,0,0,0.7); }
  .life-btn:active { transform: scale(0.95); }
  .life-total { font-family: 'Cinzel Decorative', cursive; font-size: clamp(36px, 8vw, 64px); font-weight: 900; line-height: 1; text-shadow: 0 2px 12px rgba(0,0,0,0.9), 0 0 30px currentColor; user-select: none; -webkit-user-select: none; }
  .life-total.low { color: #ef4444 !important; animation: pulse-red 1s ease-in-out infinite; }
  @keyframes pulse-red { 0%,100% { text-shadow: 0 2px 12px rgba(0,0,0,0.9), 0 0 20px #ef4444; } 50% { text-shadow: 0 2px 12px rgba(0,0,0,0.9), 0 0 50px #ef4444; } }

  .counters-row { display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; }
  .counter-chip { display: flex; align-items: center; gap: 3px; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.15); border-radius: 20px; padding: 2px 6px; font-size: 11px; cursor: pointer; transition: all 0.15s; user-select: none; -webkit-user-select: none; }
  .counter-chip:hover { transform: scale(1.08); }
  .counter-chip .val { font-family: 'Cinzel', serif; font-weight: 700; }
  .counter-chip .lbl { color: rgba(255,255,255,0.7); font-size: 9px; }

  .full-view { max-width: 420px; margin: 0 auto; padding: 0 12px 80px; }
  .full-player-card { border-radius: 16px; border: 1px solid; overflow: hidden; position: relative; min-height: 260px; margin-bottom: 10px; }
  .full-life-section { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 18px 8px; position: relative; }
  .full-life-btn { width: 50px; height: 50px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.3); background: rgba(0,0,0,0.5); color: #fff; font-size: 22px; cursor: pointer; transition: all 0.15s; display: flex; align-items: center; justify-content: center; user-select: none; -webkit-user-select: none; font-family: 'Cinzel', serif; }
  .full-life-btn:hover { transform: scale(1.12); }
  .full-life-btn:active { transform: scale(0.94); }
  .full-life-total { font-family: 'Cinzel Decorative', cursive; font-size: clamp(60px, 15vw, 96px); font-weight: 900; line-height: 1; text-shadow: 0 4px 20px rgba(0,0,0,0.9), 0 0 40px currentColor; user-select: none; -webkit-user-select: none; }

  .opponents-strip { display: flex; gap: 8px; padding: 8px 0 6px; }
  .opp-card { flex: 1; border-radius: 10px; border: 1px solid rgba(255,255,255,0.15); overflow: hidden; position: relative; min-height: 76px; }
  .opp-art { position: absolute; inset: 0; background-size: cover; background-position: center; }
  .opp-overlay { position: absolute; inset: 0; }
  .opp-inner { position: relative; z-index: 2; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; padding: 6px 4px; gap: 2px; }
  .opp-name { font-family: 'Cinzel', serif; font-size: 8px; letter-spacing: 0.1em; color: rgba(255,255,255,0.85); text-shadow: 0 1px 4px rgba(0,0,0,0.9); text-transform: uppercase; text-align: center; }
  .opp-life { font-family: 'Cinzel Decorative', cursive; font-size: 24px; font-weight: 900; line-height: 1; text-shadow: 0 1px 8px rgba(0,0,0,0.9); }

  .panel-section { margin-bottom: 10px; }
  .panel-title { font-family: 'Cinzel', serif; font-size: 10px; letter-spacing: 0.25em; color: #a89b7a; text-transform: uppercase; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
  .panel-title::before, .panel-title::after { content: ''; flex: 1; height: 1px; background: rgba(168,155,122,0.3); }

  .full-counter-grid { display: flex; flex-wrap: wrap; gap: 6px; }
  .full-counter-chip { display: flex; align-items: center; gap: 4px; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; padding: 5px 10px; }
  .full-counter-btn { width: 24px; height: 24px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.08); color: #fff; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s; user-select: none; -webkit-user-select: none; }
  .full-counter-btn:hover { background: rgba(255,255,255,0.2); }
  .full-counter-val { font-family: 'Cinzel', serif; font-size: 18px; font-weight: 700; min-width: 28px; text-align: center; }
  .full-counter-lbl { font-size: 10px; color: rgba(255,255,255,0.65); }

  .cmd-dmg-grid { display: flex; gap: 6px; flex-wrap: wrap; }
  .cmd-dmg-full { flex: 1; min-width: 80px; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; padding: 6px 8px; display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .cmd-dmg-full-name { font-size: 9px; color: rgba(255,255,255,0.6); text-align: center; }
  .cmd-dmg-full-controls { display: flex; align-items: center; gap: 6px; }
  .cmd-dmg-full-val { font-family: 'Cinzel', serif; font-size: 20px; font-weight: 700; }
  .cmd-dmg-full-btn { width: 22px; height: 22px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.06); color: #fff; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; user-select: none; -webkit-user-select: none; transition: background 0.15s; }
  .cmd-dmg-full-btn:hover { background: rgba(255,255,255,0.18); }

  .cmd-search-wrap { margin-bottom: 10px; }
  .cmd-search-row { display: flex; gap: 6px; }
  .cmd-input { flex: 1; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; color: #e8e0d0; font-family: 'Cinzel', serif; font-size: 12px; padding: 8px 12px; outline: none; }
  .cmd-input:focus { border-color: rgba(255,255,255,0.5); }
  .cmd-search-btn { font-family: 'Cinzel', serif; font-size: 10px; padding: 8px 12px; border-radius: 6px; border: 1px solid; cursor: pointer; transition: all 0.2s; background: transparent; text-transform: uppercase; letter-spacing: 0.1em; white-space: nowrap; }
  .cmd-card-display { margin-top: 8px; border-radius: 10px; overflow: hidden; border: 1px solid rgba(255,255,255,0.15); }
  .cmd-card-display img { width: 100%; display: block; border-radius: 10px; }

  .settings-panel { max-width: 420px; margin: 0 auto; padding: 0 12px 60px; }
  .settings-row { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.08); }
  .settings-label { font-family: 'Cinzel', serif; font-size: 11px; color: #c8b998; flex: 1; letter-spacing: 0.1em; text-transform: uppercase; }
  .settings-btn { font-family: 'Cinzel', serif; font-size: 10px; padding: 5px 12px; border-radius: 5px; border: 1px solid #6d28d9; color: #a78bfa; background: rgba(109,40,217,0.15); cursor: pointer; transition: all 0.2s; letter-spacing: 0.1em; }
  .settings-btn:hover { background: rgba(109,40,217,0.35); }
  .settings-btn.danger { border-color: #b91c1c; color: #f87171; background: rgba(185,28,28,0.15); }
  .settings-btn.danger:hover { background: rgba(185,28,28,0.35); }

  .modal-overlay { position: fixed; inset: 0; z-index: 50; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; padding: 16px; }
  .modal { background: #120e1e; border: 1px solid #4a3080; border-radius: 12px; padding: 24px; min-width: 280px; max-width: 360px; width: 100%; }
  .modal-title { font-family: 'Cinzel Decorative', cursive; font-size: 14px; color: #a78bfa; margin-bottom: 16px; text-align: center; }
  .modal-input { width: 100%; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.25); border-radius: 6px; color: #e8e0d0; font-family: 'Cinzel', serif; font-size: 14px; padding: 10px 12px; outline: none; margin-bottom: 12px; }
  .modal-input:focus { border-color: #a78bfa; }
  .modal-btns { display: flex; gap: 8px; justify-content: flex-end; }
  .modal-btn { font-family: 'Cinzel', serif; font-size: 11px; padding: 7px 16px; border-radius: 5px; border: 1px solid; cursor: pointer; transition: all 0.2s; letter-spacing: 0.1em; text-transform: uppercase; }

  .toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.92); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 10px 20px; font-family: 'Cinzel', serif; font-size: 12px; color: #e8e0d0; z-index: 100; animation: toast-in 0.25s ease, toast-out 0.25s ease 1.75s forwards; pointer-events: none; white-space: nowrap; }
  @keyframes toast-in { from { opacity: 0; transform: translate(-50%, 10px); } to { opacity: 1; transform: translate(-50%, 0); } }
  @keyframes toast-out { from { opacity: 1; } to { opacity: 0; } }

  .delta-badge { position: absolute; pointer-events: none; z-index: 10; font-family: 'Cinzel Decorative', cursive; font-size: 28px; font-weight: 900; text-shadow: 0 2px 8px rgba(0,0,0,0.8); animation: float-up 0.9s ease forwards; top: 50%; left: 50%; }
  @keyframes float-up { 0% { opacity: 1; transform: translate(-50%, -50%) scale(1); } 100% { opacity: 0; transform: translate(-50%, -150%) scale(1.3); } }

  .config-warning { background: rgba(185,28,28,0.15); border: 1px solid rgba(185,28,28,0.5); border-radius: 10px; padding: 14px 16px; margin: 0 0 20px; max-width: 320px; font-family: 'Lato', sans-serif; font-size: 12px; line-height: 1.7; color: #fca5a5; }
  .config-warning strong { font-family: 'Cinzel', serif; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; }
`;

// ── Small helpers ─────────────────────────────────────────────────────────────
function DeltaBadge({ delta, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 900); return () => clearTimeout(t); }, [onDone]);
  return (
    <div className="delta-badge" style={{ color: delta > 0 ? "#4ade80" : "#f87171" }}>
      {delta > 0 ? "+" : ""}{delta}
    </div>
  );
}

function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2200); return () => clearTimeout(t); }, [onDone]);
  return <div className="toast">{msg}</div>;
}

function NameModal({ player, onSave, onClose }) {
  const [val, setVal] = useState(player.name);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">Edit Name</div>
        <input className="modal-input" value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => e.key === "Enter" && onSave(val)} autoFocus maxLength={20} />
        <div className="modal-btns">
          <button className="modal-btn" style={{ border: "1px solid #555", color: "#aaa", background: "transparent" }} onClick={onClose}>Cancel</button>
          <button className="modal-btn" style={{ border: "1px solid #6d28d9", color: "#a78bfa", background: "rgba(109,40,217,0.2)" }} onClick={() => onSave(val)}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ── Lobby ─────────────────────────────────────────────────────────────────────
function Lobby({ onJoin }) {
  const [joinCode, setJoinCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const needsConfig = FIREBASE_CONFIG.apiKey === "YOUR_API_KEY";

  async function createRoom() {
    if (needsConfig) { setError("Please add your Firebase config first (see setup guide below)."); return; }
    setLoading(true); setError("");
    const code = genRoomCode();
    try {
      await set(ref(db, `rooms/${code}`), { players: [0,1,2,3].map(makePlayer), createdAt: Date.now() });
      onJoin(code, true);
    } catch (e) { setError("Could not create room: " + e.message); }
    setLoading(false);
  }

  async function joinRoom() {
    if (needsConfig) { setError("Please add your Firebase config first."); return; }
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 4) { setError("Enter a 4-letter room code."); return; }
    setLoading(true); setError("");
    try {
      const snap = await get(ref(db, `rooms/${code}`));
      if (!snap.exists()) { setError("Room not found. Check the code and try again."); setLoading(false); return; }
      onJoin(code, false);
    } catch (e) { setError("Connection failed: " + e.message); }
    setLoading(false);
  }

  return (
    <div className="lobby">
      <div className="lobby-title">⚔ Commander Vault</div>
      <div className="lobby-sub">EDH Life Tracker · Real-time Sync</div>

      {needsConfig && (
        <div className="config-warning">
          <strong>⚠ Setup required</strong><br />
          Add your Firebase config to the top of the file.<br />
          See the setup guide below the app.
        </div>
      )}

      <div className="lobby-card">
        <div className="lobby-card-title">Start a new game</div>
        <button className="lobby-btn primary" onClick={createRoom} disabled={loading}>
          {loading ? "Creating…" : "⚔ Create Room"}
        </button>
      </div>

      <div className="lobby-divider"><span>or</span></div>

      <div className="lobby-card">
        <div className="lobby-card-title">Join existing game</div>
        <input className="lobby-input" placeholder="ROOM" maxLength={4}
          value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === "Enter" && joinRoom()} />
        <button className="lobby-btn secondary" onClick={joinRoom} disabled={loading}>
          {loading ? "Joining…" : "Join Room"}
        </button>
      </div>

      {error && <div style={{ color: "#f87171", fontFamily: "'Cinzel'", fontSize: 11, marginTop: 14, textAlign: "center", maxWidth: 300 }}>{error}</div>}
    </div>
  );
}

// ── Room screen (show code before starting) ───────────────────────────────────
function RoomScreen({ roomCode, isHost, onEnter, onLeave }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard?.writeText(roomCode).catch(() => {});
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="lobby">
      <div className="lobby-title">⚔ Commander Vault</div>
      <div className="lobby-sub">{isHost ? "Share this code with your friends" : "Joined room"}</div>
      <div className="lobby-card" style={{ alignItems: "center", gap: 16 }}>
        <div style={{ fontFamily: "'Cinzel'", fontSize: 11, color: "#a89b7a", letterSpacing: "0.2em", textTransform: "uppercase" }}>Room Code</div>
        <div className="room-code-display">{roomCode}</div>
        <button className="lobby-btn secondary" style={{ width: "100%" }} onClick={copy}>
          {copied ? "✓ Copied!" : "📋 Copy Code"}
        </button>
        <button className="lobby-btn primary" style={{ width: "100%" }} onClick={onEnter}>
          ▶ Enter Game
        </button>
        <button className="lobby-btn secondary" style={{ width: "100%", fontSize: 10 }} onClick={onLeave}>
          Leave Room
        </button>
      </div>
      <div style={{ fontFamily: "'Cinzel'", fontSize: 10, color: "#555", marginTop: 16, textAlign: "center", letterSpacing: "0.1em", lineHeight: 1.8 }}>
        All players open the app → Join Room → enter {roomCode}<br />
        Then each person picks their player tab
      </div>
    </div>
  );
}

// ── Player card (grid) ────────────────────────────────────────────────────────
function PlayerCard({ player, theme, onUpdate, onEditName }) {
  const [deltas, setDeltas] = useState([]);
  function addDelta(v) { setDeltas(d => [...d, { id: Date.now() + Math.random(), v }]); }
  function removeDelta(id) { setDeltas(d => d.filter(x => x.id !== id)); }
  function changeLife(delta) { addDelta(delta); onUpdate({ life: player.life + delta }); }
  const glow = player.commander ? getGlow(player.commander.colors) : theme.accent;

  return (
    <div className={`player-card${player.alive ? "" : " dead"}`} style={{
      background: player.commander ? "transparent" : theme.bg,
      borderColor: theme.border,
      boxShadow: `0 0 18px ${glow}33`,
    }}>
      {player.commander?.image && <>
        <div className="card-art" style={{ backgroundImage: `url(${player.commander.image})` }} />
        <div className="card-art-overlay" style={{ background: theme.bg.replace("0.92", "0.72") }} />
      </>}
      <div className="card-inner">
        <div className="player-name-row">
          <span className="player-name" style={{ color: theme.accent }}>{player.name}</span>
          <button className="edit-name-btn" onClick={() => onEditName(player.id)}>✎</button>
        </div>
        <div className="life-section">
          <button className="life-btn" onClick={() => changeLife(-1)}>−</button>
          <span className={`life-total${player.life <= 5 ? " low" : ""}`}
            style={{ color: player.life <= 5 ? "#ef4444" : theme.accent }}>
            {player.alive ? player.life : "☠"}
          </span>
          <button className="life-btn" onClick={() => changeLife(1)}>+</button>
          {deltas.map(d => <DeltaBadge key={d.id} delta={d.v} onDone={() => removeDelta(d.id)} />)}
        </div>
        <div className="counters-row">
          {COUNTER_TYPES.filter(c => player.counters[c.key] > 0).map(c => (
            <div key={c.key} className="counter-chip" style={{ borderColor: c.color + "66" }}
              onClick={() => onUpdate({ counters: { ...player.counters, [c.key]: player.counters[c.key] + 1 } })}
              onContextMenu={e => { e.preventDefault(); onUpdate({ counters: { ...player.counters, [c.key]: Math.max(0, player.counters[c.key] - 1) } }); }}>
              <span className="val" style={{ color: c.color }}>{player.counters[c.key]}</span>
              <span className="lbl">{c.label.split(" ").slice(1).join(" ")}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Full player view ──────────────────────────────────────────────────────────
function FullPlayerView({ player, theme, allPlayers, onUpdate, onToast }) {
  const [cmdSearch, setCmdSearch] = useState(player.commanderName || "");
  const [loading, setLoading] = useState(false);
  const [deltas, setDeltas] = useState([]);
  function addDelta(v) { setDeltas(d => [...d, { id: Date.now() + Math.random(), v }]); }
  function removeDelta(id) { setDeltas(d => d.filter(x => x.id !== id)); }
  function changeLife(delta) { addDelta(delta); onUpdate({ life: player.life + delta }); }
  function changeCounter(key, delta) {
    onUpdate({ counters: { ...player.counters, [key]: Math.max(0, (player.counters[key] || 0) + delta) } });
  }
  function changeCmdDmg(fromIdx, delta) {
    const cd = [...(player.commanderDamage || [0,0,0,0])];
    cd[fromIdx] = Math.max(0, (cd[fromIdx] || 0) + delta);
    onUpdate({ commanderDamage: cd });
    if (cd[fromIdx] >= 21) onToast(`⚔ Commander lethal from ${allPlayers[fromIdx].name}!`);
  }
  async function searchCommander() {
    if (!cmdSearch.trim()) return;
    setLoading(true);
    const card = await fetchCommanderCard(cmdSearch);
    setLoading(false);
    if (card) { onUpdate({ commander: card, commanderName: card.name }); onToast(`Commander: ${card.name}`); }
    else onToast("Card not found — check spelling");
  }
  const glow = player.commander ? getGlow(player.commander.colors) : theme.accent;
  const opponents = allPlayers.filter(p => p.id !== player.id);

  return (
    <div className="full-view">
      {/* Opponents strip */}
      <div className="opponents-strip">
        {opponents.map(opp => {
          const ot = PLAYER_THEMES[opp.id];
          return (
            <div key={opp.id} className="opp-card" style={{ borderColor: ot.border }}>
              {opp.commander?.image
                ? <><div className="opp-art" style={{ backgroundImage: `url(${opp.commander.image})` }} /><div className="opp-overlay" style={{ background: ot.bg.replace("0.92","0.78") }} /></>
                : <div className="opp-art" style={{ background: ot.bg }} />}
              <div className="opp-inner">
                <span className="opp-name" style={{ color: ot.accent }}>{opp.name}</span>
                {opp.alive
                  ? <span className="opp-life" style={{ color: opp.life <= 5 ? "#ef4444" : ot.accent }}>{opp.life}</span>
                  : <span style={{ fontSize: 10, color: "#ef4444" }}>☠</span>}
                {opp.counters?.poison > 0 && <span style={{ fontSize: 9, color: "#8bc34a" }}>☠ {opp.counters.poison}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Main life panel */}
      <div className="full-player-card" style={{ background: player.commander ? "transparent" : theme.bg, borderColor: theme.border, boxShadow: `0 0 40px ${glow}44` }}>
        {player.commander?.image && <>
          <div className="card-art" style={{ backgroundImage: `url(${player.commander.image})` }} />
          <div className="card-art-overlay" style={{ background: theme.bg.replace("0.92","0.80") }} />
        </>}
        <div style={{ position: "relative", zIndex: 2 }}>
          <div style={{ textAlign: "center", paddingTop: 14 }}>
            <span style={{ fontFamily:"'Cinzel',serif", fontSize:13, fontWeight:700, color:theme.accent, letterSpacing:"0.12em", textTransform:"uppercase", textShadow:"0 1px 6px rgba(0,0,0,0.9)" }}>{player.name}</span>
            {player.commander && <div style={{ fontSize:9, color:"rgba(255,255,255,0.55)", letterSpacing:"0.1em" }}>{player.commander.name}</div>}
          </div>
          <div className="full-life-section">
            <button className="full-life-btn" onClick={() => changeLife(-5)} style={{ fontSize: 13 }}>−5</button>
            <button className="full-life-btn" onClick={() => changeLife(-1)}>−</button>
            <span className={`full-life-total${player.life <= 5 ? " low" : ""}`} style={{ color: player.life <= 5 ? "#ef4444" : theme.accent }}>
              {player.alive ? player.life : "☠"}
            </span>
            <button className="full-life-btn" onClick={() => changeLife(1)}>+</button>
            <button className="full-life-btn" onClick={() => changeLife(5)} style={{ fontSize: 13 }}>+5</button>
            {deltas.map(d => <DeltaBadge key={d.id} delta={d.v} onDone={() => removeDelta(d.id)} />)}
          </div>
        </div>
      </div>

      {/* Counters */}
      <div className="panel-section">
        <div className="panel-title">Counters</div>
        <div className="full-counter-grid">
          {COUNTER_TYPES.map(c => (
            <div key={c.key} className="full-counter-chip">
              <button className="full-counter-btn" onClick={() => changeCounter(c.key, -1)}>−</button>
              <div style={{ textAlign: "center" }}>
                <div className="full-counter-val" style={{ color: c.color }}>{player.counters?.[c.key] || 0}</div>
                <div className="full-counter-lbl">{c.label}</div>
              </div>
              <button className="full-counter-btn" onClick={() => changeCounter(c.key, 1)}>+</button>
            </div>
          ))}
        </div>
      </div>

      {/* Commander damage */}
      <div className="panel-section">
        <div className="panel-title">Commander Damage Received</div>
        <div className="cmd-dmg-grid">
          {opponents.map(opp => {
            const dmg = (player.commanderDamage || [0,0,0,0])[opp.id] || 0;
            return (
              <div key={opp.id} className="cmd-dmg-full">
                <span className="cmd-dmg-full-name" style={{ color: PLAYER_THEMES[opp.id].accent }}>{opp.name}</span>
                <div className="cmd-dmg-full-controls">
                  <button className="cmd-dmg-full-btn" onClick={() => changeCmdDmg(opp.id, -1)}>−</button>
                  <span className="cmd-dmg-full-val" style={{ color: dmg >= 21 ? "#ef4444" : "#fff" }}>{dmg}</span>
                  <button className="cmd-dmg-full-btn" onClick={() => changeCmdDmg(opp.id, 1)}>+</button>
                </div>
                {dmg >= 21 && <span style={{ fontSize: 8, color: "#ef4444", letterSpacing: "0.1em" }}>LETHAL</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Commander search */}
      <div className="cmd-search-wrap">
        <div className="panel-title">Commander</div>
        <div className="cmd-search-row">
          <input className="cmd-input" placeholder="Search card name…" value={cmdSearch}
            onChange={e => setCmdSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && searchCommander()} />
          <button className="cmd-search-btn" style={{ borderColor: theme.border, color: theme.accent, background: theme.bg }}
            onClick={searchCommander} disabled={loading}>{loading ? "…" : "Find"}</button>
        </div>
        {player.commander?.fullImage && (
          <div className="cmd-card-display">
            <img src={player.commander.fullImage} alt={player.commander.name} />
          </div>
        )}
        {player.commander && (
          <button className="cmd-search-btn" style={{ marginTop: 8, width: "100%", borderColor: "#b91c1c", color: "#f87171" }}
            onClick={() => { onUpdate({ commander: null, commanderName: "" }); setCmdSearch(""); }}>
            Remove Commander
          </button>
        )}
      </div>
    </div>
  );
}

// ── Root App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("lobby");
  const [roomCode, setRoomCode] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [players, setPlayers] = useState([0,1,2,3].map(makePlayer));
  const [view, setView] = useState("grid");
  const [editingName, setEditingName] = useState(null);
  const [toast, setToast] = useState(null);
  const [connected, setConnected] = useState(false);
  const unsubRef = useRef(null);

  // Subscribe to Firebase
  useEffect(() => {
    if (!roomCode || !db) return;
    const r = ref(db, `rooms/${roomCode}/players`);
    unsubRef.current = onValue(r, snap => {
      if (!snap.exists()) return;
      const raw = snap.val();
      const arr = Array.isArray(raw) ? raw : Object.values(raw);
      setPlayers(arr.map((p, i) => ({ ...makePlayer(i), ...p, id: i })));
      setConnected(true);
    }, () => setConnected(false));
    return () => unsubRef.current?.();
  }, [roomCode]);

  const updatePlayer = useCallback((id, patch) => {
    if (!db || !roomCode) return;
    setPlayers(current => {
      const player = current.find(p => p.id === id);
      if (!player) return current;
      const next = { ...player, ...patch };
      next.alive = !(next.life <= 0 || (next.counters?.poison || 0) >= 10);
      // strip undefined values Firebase doesn't like
      const clean = JSON.parse(JSON.stringify(next));
      set(ref(db, `rooms/${roomCode}/players/${id}`), clean).catch(console.error);
      return current.map(p => p.id === id ? next : p);
    });
  }, [roomCode]);

  function showToast(msg) { setToast(null); setTimeout(() => setToast(msg), 10); }

  async function resetLife() {
    if (!db || !roomCode) return;
    const updates = {};
    players.forEach((p, i) => {
      updates[`rooms/${roomCode}/players/${i}`] = JSON.parse(JSON.stringify({ ...p, life: STARTING_LIFE, commanderDamage: [0,0,0,0], alive: true }));
    });
    await update(ref(db), updates);
    showToast("Life totals reset to 40");
  }

  async function fullReset() {
    if (!db || !roomCode) return;
    await set(ref(db, `rooms/${roomCode}/players`), [0,1,2,3].map(makePlayer));
    showToast("Full game reset");
  }

  const activePlayer = view.startsWith("player") ? parseInt(view.replace("player","")) : null;

  const RuneSVG = () => (
    <svg className="rune-svg" viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg">
      <circle cx="400" cy="400" r="350" fill="none" stroke="#a78bfa" strokeWidth="1" />
      <circle cx="400" cy="400" r="280" fill="none" stroke="#c9a84c" strokeWidth="0.5" />
      {[0,60,120,180,240,300].map(a => (
        <line key={a} x1={400+350*Math.cos(a*Math.PI/180)} y1={400+350*Math.sin(a*Math.PI/180)}
          x2={400+350*Math.cos((a+180)*Math.PI/180)} y2={400+350*Math.sin((a+180)*Math.PI/180)}
          stroke="#a78bfa" strokeWidth="0.5" />
      ))}
      <polygon points="400,50 694,575 106,575" fill="none" stroke="#c9a84c" strokeWidth="0.5" />
      <polygon points="400,750 106,225 694,225" fill="none" stroke="#c9a84c" strokeWidth="0.5" />
    </svg>
  );

  return (
    <>
      <style>{globalStyle}</style>
      <div className="rune-bg" />
      <RuneSVG />

      {screen === "lobby" && (
        <Lobby onJoin={(code, host) => { setRoomCode(code); setIsHost(host); setScreen("room"); }} />
      )}

      {screen === "room" && (
        <RoomScreen roomCode={roomCode} isHost={isHost}
          onEnter={() => setScreen("game")}
          onLeave={() => { unsubRef.current?.(); setRoomCode(null); setScreen("lobby"); }} />
      )}

      {screen === "game" && (
        <div className="app-wrap">
          {/* Status bar */}
          <div className="status-bar">
            <span style={{ display:"flex", alignItems:"center" }}>
              <span className={`status-dot ${connected ? "live" : "offline"}`} />
              <span style={{ color: connected ? "#4ade80" : "#ef4444" }}>{connected ? "Live" : "Reconnecting"}</span>
            </span>
            <span style={{ color: "#c9a84c", letterSpacing: "0.2em", fontWeight: 700 }}>{roomCode}</span>
            <button style={{ fontFamily:"'Cinzel'", fontSize:9, background:"transparent", border:"none", color:"#666", cursor:"pointer", letterSpacing:"0.1em" }}
              onClick={() => setScreen("room")}>← Room</button>
          </div>

          <div className="header">
            <h1>⚔ Commander Vault</h1>
            <p>EDH Life Tracker</p>
          </div>

          <div className="view-bar">
            {["grid","player0","player1","player2","player3","settings"].map(v => {
              const label = v === "grid" ? "All" : v === "settings" ? "⚙" : (players[parseInt(v.replace("player",""))]?.name || v);
              const t = v.startsWith("player") ? PLAYER_THEMES[parseInt(v.replace("player",""))] : null;
              const active = view === v;
              return (
                <button key={v} className={`view-btn${active?" active":""}`}
                  style={{ borderColor: t?t.border:"#4a3080", color: active?"#080810":(t?t.accent:"#a78bfa"), background: active?(t?t.accent:"#a78bfa"):"transparent" }}
                  onClick={() => setView(v)}>{label}</button>
              );
            })}
          </div>

          {view === "grid" && (
            <div className="grid-4">
              {players.map(p => (
                <PlayerCard key={p.id} player={p} theme={PLAYER_THEMES[p.id]}
                  onUpdate={patch => updatePlayer(p.id, patch)}
                  onEditName={id => setEditingName(id)} />
              ))}
            </div>
          )}

          {activePlayer !== null && players[activePlayer] && (
            <FullPlayerView player={players[activePlayer]} theme={PLAYER_THEMES[activePlayer]}
              allPlayers={players} onUpdate={patch => updatePlayer(activePlayer, patch)} onToast={showToast} />
          )}

          {view === "settings" && (
            <div className="settings-panel">
              <div style={{ height: 8 }} />
              <div className="settings-row">
                <span className="settings-label">Room Code</span>
                <span style={{ fontFamily:"'Cinzel Decorative'", color:"#c9a84c", fontSize:16, letterSpacing:"0.2em" }}>{roomCode}</span>
              </div>
              <div className="settings-row">
                <span className="settings-label">Reset Life Totals</span>
                <button className="settings-btn" onClick={resetLife}>Reset Life</button>
              </div>
              <div className="settings-row">
                <span className="settings-label">Full Game Reset</span>
                <button className="settings-btn danger" onClick={fullReset}>Full Reset</button>
              </div>
              <div style={{ marginTop:24, padding:"16px 0", borderTop:"1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ fontFamily:"'Cinzel'", fontSize:10, color:"#a89b7a", letterSpacing:"0.15em", marginBottom:12, textTransform:"uppercase" }}>Rules Reference</div>
                {[
                  ["Commander Damage","21 combat damage from one commander = lethal"],
                  ["Poison Counters","10 poison counters = lethal"],
                  ["Commander Tax","+2 mana per re-cast from command zone"],
                  ["Starting Life","40 life in Commander (EDH)"],
                ].map(([k,v]) => (
                  <div key={k} style={{ marginBottom:10 }}>
                    <div style={{ fontFamily:"'Cinzel'", fontSize:11, color:"#c8b998" }}>{k}</div>
                    <div style={{ fontSize:11, color:"rgba(255,255,255,0.55)", marginTop:2 }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {editingName !== null && (
            <NameModal player={players[editingName]}
              onSave={name => { updatePlayer(editingName, { name }); setEditingName(null); }}
              onClose={() => setEditingName(null)} />
          )}

          {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
        </div>
      )}
    </>
  );
}
