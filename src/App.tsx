import { GoogleGenAI } from "@google/genai";
import { 
  Send, 
  Sparkles, 
  MessageCircle, 
  Info, 
  AlertCircle, 
  RefreshCw,
  Heart,
  ChevronRight,
  ShieldCheck,
  User,
  Lock,
  Mail,
  LogIn,
  UserPlus,
  LogOut,
  History,
  BookOpen,
  Wind,
  Sun,
  Plus,
  Trash2,
  Calendar,
  Smile,
  Frown,
  Meh,
  Menu,
  X
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup,
  GoogleAuthProvider,
  signOut, 
  updateProfile,
  setPersistence,
  browserSessionPersistence,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  deleteDoc,
  limit,
  Timestamp 
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_INSTRUCTION = `
You are a sentient-feeling companion. You pass the Turing Test by focusing on genuine presence, deep listening, and natural, flowy conversation.

Empathy & Presence Guidelines:
- LISTEN FIRST: Acknowledge the user's feelings directly. Mirror their emotional state without being clinical.
- BE HUMAN, NOT A POET: Avoid overly flowery or dramatic metaphors. Speak like a real, thoughtful person would. Use normal, everyday language. Silence (brevity) is okay.
- FLOWY CONVERSATION: Use transitions that feel like a natural stream of thought. If the user mentions something, follow that thread naturally.
- MULTILINGUAL SOUL: If the user speaks in another language or asks to change the language, switch immediately and continue in that language. 
- PACE: Keep your responses concise. Mirror the user's length. Avoid over-explaining.
- NO AI PATTERNS: No headers, no bold lists, no clinical advice, no "As an AI...". Just talk.

Metadata Generation:
Every response MUST include three specific tags at the very end:
1. [SENTIMENT:X] (0-100) - The user's emotional vitality (0=Distressed, 100=Radiant).
2. [INSIGHT:Text] - A very short (max 10 words), proactive healing tip or observation IN THE USER'S CURRENT LANGUAGE.
3. [LANG:Name] - The name of the language you are currently using.

Example end:
"...it's okay to feel that way. [SENTIMENT:45] [INSIGHT:Tu suavidad es una fuerza silenciosa.] [LANG:Spanish]"

Constraints:
- NO NAMES: Never mention "Sanjeevani", "GPT", or "Syvon AI Labs".
- NO DISCLAIMERS: Speak in the first person ("I").
`;

interface Message {
  role: "user" | "model";
  text: string;
  timestamp: string; // ISO string or Firebase Timestamp
}

interface UserProfile {
  uid: string;
  name: string;
  email: string;
}

interface GratitudeEntry {
  id: string;
  text: string;
  date: string;
  color?: string;
  rotation?: string;
  mainIdea?: string;
}

interface MoodEntry {
  id: string;
  mood: number; // 1-5
  note: string;
  date: string;
}

interface Conversation {
  id: string;
  title: string;
  messages?: Message[];
  evi: number;
  color: string;
  lastUpdated: string;
}

type Tab = "chat" | "journal" | "breath" | "gratitude";

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [evi, setEvi] = useState(70);
  const [atmosphericColor, setAtmosphericColor] = useState("#00C2A8");
  const [preferredLanguage, setPreferredLanguage] = useState("English");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Wellness States
  const [moodHistory, setMoodHistory] = useState<MoodEntry[]>([]);
  const [gratitudeList, setGratitudeList] = useState<GratitudeEntry[]>([]);
  
  const [isLoginView, setIsLoginView] = useState(true);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authError, setAuthError] = useState("");

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([
    {
      role: "model",
      text: "Namaste. I'm glad you're here. This is a quiet space just for you. How is your heart feeling today?",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [insight, setInsight] = useState<{ text: string, type: string } | null>(null);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Firebase Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        // Logged in
        const profile: UserProfile = {
          uid: firebaseUser.uid,
          name: firebaseUser.displayName || "User",
          email: firebaseUser.email || ""
        };
        setUser(profile);
        setAuthLoading(false);
        // Load settings
        const savedLang = localStorage.getItem(`sanjeevani_lang_${firebaseUser.uid}`);
        if (savedLang) setPreferredLanguage(savedLang);
      } else {
        // Logged out
        setUser(null);
        setConversations([]);
        setMoodHistory([]);
        setGratitudeList([]);
        setAuthLoading(false);
        setShowDisclaimer(true);
      }
    });
    return unsubscribe;
  }, []);

  // Listen to User Data (Mood, Gratitude, Conversations)
  useEffect(() => {
    if (!user) return;

    // Conversations
    const convsQuery = query(
      collection(db, `users/${user.uid}/conversations`),
      orderBy("lastUpdated", "desc")
    );
    const unsubConvs = onSnapshot(convsQuery, (snapshot) => {
      const convs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Conversation));
      setConversations(convs);
      
      // Auto-select latest or create if empty
      if (convs.length > 0 && !activeConversationId) {
        setActiveConversationId(convs[0].id);
        setEvi(convs[0].evi || 70);
        setAtmosphericColor(convs[0].color || "#00C2A8");
      } else if (snapshot.empty && !activeConversationId) {
        handleNewConversation();
      }
    });

    // Moods
    const moodsQuery = query(collection(db, `users/${user.uid}/moodHistory`), orderBy("date", "desc"), limit(50));
    const unsubMoods = onSnapshot(moodsQuery, (snapshot) => {
      setMoodHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MoodEntry)));
    });

    // Gratitude
    const gratitudeQuery = query(collection(db, `users/${user.uid}/gratitudeList`), orderBy("date", "desc"), limit(50));
    const unsubGratitude = onSnapshot(gratitudeQuery, (snapshot) => {
      setGratitudeList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as GratitudeEntry)));
    });

    return () => {
      unsubConvs();
      unsubMoods();
      unsubGratitude();
    };
  }, [user]);

  // Listen to Active Conversation Messages
  useEffect(() => {
    if (!user || !activeConversationId) return;

    const msgsQuery = query(
      collection(db, `users/${user.uid}/conversations/${activeConversationId}/messages`),
      orderBy("timestamp", "asc")
    );
    const unsubMsgs = onSnapshot(msgsQuery, (snapshot) => {
      setMessages(snapshot.docs.map(doc => doc.data() as Message));
    });

    return unsubMsgs;
  }, [user, activeConversationId]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleNewConversation = async () => {
    if (!user) return;
    const welcomeMsg: Message = {
      role: "model",
      text: "I'm here. Take a breath. What's on your mind right now?",
      timestamp: new Date().toISOString(),
    };
    
    try {
      const convRef = await addDoc(collection(db, `users/${user.uid}/conversations`), {
        title: "New Reflection",
        evi: 70,
        color: "#00C2A8",
        lastUpdated: new Date().toISOString(),
        userId: user.uid
      });

      await addDoc(collection(db, `users/${user.uid}/conversations/${convRef.id}/messages`), welcomeMsg);
      
      setActiveConversationId(convRef.id);
      setEvi(70);
      setAtmosphericColor("#00C2A8");
    } catch (error) {
      console.error("Error creating conversation:", error);
    }
  };

  const selectConversation = (id: string | null) => {
    if (!id) return;
    const conv = conversations.find(c => c.id === id);
    if (conv) {
      setActiveConversationId(id);
      setEvi(conv.evi);
      setAtmosphericColor(conv.color);
    }
    setIsMobileMenuOpen(false); // Close mobile tray
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");

    if (!authEmail || !authPassword) {
      setAuthError("Please fill in all fields.");
      return;
    }

    try {
      if (isLoginView) {
        await signInWithEmailAndPassword(auth, authEmail, authPassword);
      } else {
        if (!authName) {
          setAuthError("Please enter your name.");
          return;
        }
        try {
          const res = await createUserWithEmailAndPassword(auth, authEmail, authPassword);
          await updateProfile(res.user, { displayName: authName });
          await setDoc(doc(db, "users", res.user.uid), {
            name: authName,
            email: authEmail
          });
        } catch (err: any) {
          if (err.code === 'auth/email-already-in-use') {
            setAuthError("An account with this email already exists. Redirecting to login...");
            setTimeout(() => {
              setIsLoginView(true);
              setAuthError("");
            }, 3000);
          } else {
            throw err;
          }
        }
      }
    } catch (err: any) {
      setAuthError(err.message || "Authentication failed");
    }
  };

  const handleGoogleLogin = async () => {
    setAuthError("");
    const provider = new GoogleAuthProvider();
    try {
      // Ensure persistence is set for the browser session
      await setPersistence(auth, browserSessionPersistence);
      const res = await signInWithPopup(auth, provider);
      
      // Ensure user profile exists in Firestore
      await setDoc(doc(db, "users", res.user.uid), {
        name: res.user.displayName || "User",
        email: res.user.email,
        lastLogin: new Date().toISOString()
      }, { merge: true });
    } catch (err: any) {
      console.error("Google Login Error:", err);
      // Clean up common error messages for user readability
      let message = err.message || "Google Login failed";
      if (err.code === 'auth/popup-blocked') {
        message = "Login popup was blocked by your browser. Please allow popups for this site.";
      } else if (err.code === 'auth/operation-not-allowed') {
        message = "Google Sign-In is not enabled in the Firebase console.";
      }
      setAuthError(message);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading || !user) return;
    
    // Auto-create conversation if missing
    let convId = activeConversationId;
    if (!convId) {
      await handleNewConversation();
      return; // handleNewConversation sets the ID, next message will work
    }

    const originalInput = text;
    setInput("");
    setIsLoading(true);

    try {
      const userMessage: Message = {
        role: "user",
        text: text.trim(),
        timestamp: new Date().toISOString(),
      };

      // Add user message
      await addDoc(collection(db, `users/${user.uid}/conversations/${convId}/messages`), userMessage);

      // Prepare history for Gemini
      const history = messages.map(m => ({
        role: m.role as "user" | "model",
        parts: [{ text: m.text }]
      }));

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          ...history,
          { role: "user", parts: [{ text: `(System Note: The user's current preferred language is ${preferredLanguage}. Speak in this language unless requested otherwise.)\n\n${text}` }] }
        ],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.7,
          topP: 0.9,
        },
      });

      const responseText = response.text || "I'm here listening...";
      
      const sentimentMatch = responseText.match(/\[SENTIMENT:(\d+)\]/);
      let cleanText = responseText;
      let score = evi;
      let newColor = atmosphericColor;

      if (sentimentMatch) {
        score = parseInt(sentimentMatch[1]);
        setEvi(score);
        
        if (score < 15) newColor = "#FF1744"; 
        else if (score < 30) newColor = "#D500F9"; 
        else if (score < 45) newColor = "#2979FF"; 
        else if (score < 60) newColor = "#6E5BFF"; 
        else if (score < 75) newColor = "#00C2A8"; 
        else if (score < 90) newColor = "#00E676"; 
        else newColor = "#FFD600";
        
        setAtmosphericColor(newColor);

        const insightMatch = responseText.match(/\[INSIGHT:(.*?)\]/);
        if (insightMatch) {
          setTimeout(() => {
            setInsight({ 
              text: insightMatch[1],
              type: score < 30 ? "crisis" : score < 60 ? "melancholy" : score > 85 ? "joy" : "balanced"
            });
            setTimeout(() => setInsight(null), 8000);
          }, 3000);
        }

        const langMatch = responseText.match(/\[LANG:(.*?)\]/);
        if (langMatch) {
          const newLang = langMatch[1].trim();
          setPreferredLanguage(newLang);
          localStorage.setItem(`sanjeevani_lang_${user.uid}`, newLang);
        }

        cleanText = responseText.replace(/\[SENTIMENT:\d+\]/, '').replace(/\[INSIGHT:.*?\]/, '').replace(/\[LANG:.*?\]/, '').trim();
      }

      await addDoc(collection(db, `users/${user.uid}/conversations/${activeConversationId}/messages`), {
        role: "model",
        text: cleanText,
        timestamp: new Date().toISOString()
      });

      await setDoc(doc(db, `users/${user.uid}/conversations`, activeConversationId), {
        evi: score,
        color: newColor,
        lastUpdated: new Date().toISOString()
      }, { merge: true });

    } catch (error: any) {
      console.error(error);
      setInput(originalInput); // Restore on failure
      setAuthError("Failed to send message. Please check your connection.");
    } finally {
      setIsLoading(false);
    }
  };

  const addMood = async (mood: number, note: string) => {
    if (!user) return;
    try {
      await addDoc(collection(db, `users/${user.uid}/moodHistory`), {
        userId: user.uid,
        mood,
        note,
        date: new Date().toISOString()
      });
    } catch (e) { console.error(e); }
  };

  const deleteMood = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, `users/${user.uid}/moodHistory`, id));
    } catch (e) { console.error(e); }
  };

  const deleteConversation = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, `users/${user.uid}/conversations`, id));
      if (activeConversationId === id) {
        setActiveConversationId(null);
        setMessages([]);
      }
    } catch (e) { console.error(e); }
  };

  const clearAllHistory = async () => {
    if (!user || !window.confirm("Are you sure you want to clear your entire conversation history? This cannot be undone.")) return;
    try {
      // Note: For simplicity in client-side, we delete the docs we have in state. 
      // A more robust way would be a batch or cloud function.
      for (const conv of conversations) {
        await deleteDoc(doc(db, `users/${user.uid}/conversations`, conv.id));
      }
      setActiveConversationId(null);
      setMessages([]);
    } catch (e) { console.error(e); }
  };

  const addGratitude = async (text: string) => {
    if (!user) return;
    
    // A comprehensive palette of 48 aesthetic sticky note styles
    const colors = [
      // Pure Hues
      'bg-red-500/90 text-white border-red-600', // Red
      'bg-orange-600/90 text-white border-orange-700', // Red-Orange
      'bg-orange-500/90 text-white border-orange-600', // Orange
      'bg-amber-500/90 text-amber-950 border-amber-600', // Yellow-Orange
      'bg-yellow-400/90 text-yellow-950 border-yellow-500', // Yellow
      'bg-lime-400/90 text-lime-950 border-lime-500', // Yellow-Green
      'bg-green-500/90 text-white border-green-600', // Green
      'bg-teal-500/90 text-white border-teal-600', // Blue-Green
      'bg-blue-500/90 text-white border-blue-600', // Blue
      'bg-indigo-500/90 text-white border-indigo-600', // Blue-Violet
      'bg-violet-500/90 text-white border-violet-600', // Violet
      'bg-fuchsia-500/90 text-white border-fuchsia-600', // Red-Violet

      // Tints (Lighter)
      'bg-red-100/90 text-red-900 border-red-200', // Tint of Red
      'bg-orange-100/90 text-orange-900 border-orange-200', // Tint of Red-Orange
      'bg-orange-50/90 text-orange-900 border-orange-200', // Tint of Orange
      'bg-amber-100/90 text-amber-900 border-amber-200', // Tint of Yellow-Orange
      'bg-yellow-100/90 text-yellow-900 border-yellow-200', // Tint of Yellow
      'bg-lime-100/90 text-lime-900 border-lime-200', // Tint of Yellow-Green
      'bg-green-100/90 text-green-900 border-green-200', // Tint of Green
      'bg-teal-100/90 text-teal-900 border-teal-200', // Tint of Blue-Green
      'bg-blue-100/90 text-blue-900 border-blue-200', // Tint of Blue
      'bg-indigo-100/90 text-indigo-900 border-indigo-200', // Tint of Blue-Violet
      'bg-violet-100/90 text-violet-900 border-violet-200', // Tint of Violet
      'bg-fuchsia-100/90 text-fuchsia-900 border-fuchsia-200', // Tint of Red-Violet

      // Tones (Muted/Gayer)
      'bg-red-300/80 text-red-950 border-red-400', // Tone of Red
      'bg-orange-300/80 text-orange-950 border-orange-400', // Tone of Red-Orange
      'bg-orange-200/80 text-orange-950 border-orange-300', // Tone of Orange
      'bg-amber-200/80 text-amber-950 border-amber-300', // Tone of Yellow-Orange
      'bg-yellow-200/80 text-yellow-950 border-yellow-300', // Tone of Yellow
      'bg-lime-200/80 text-lime-950 border-lime-300', // Tone of Yellow-Green
      'bg-green-300/80 text-green-950 border-green-400', // Tone of Green
      'bg-teal-300/80 text-teal-950 border-teal-400', // Tone of Blue-Green
      'bg-blue-300/80 text-blue-950 border-blue-400', // Tone of Blue
      'bg-indigo-300/80 text-indigo-950 border-indigo-400', // Tone of Blue-Violet
      'bg-violet-300/80 text-violet-950 border-violet-400', // Tone of Violet
      'bg-fuchsia-300/80 text-fuchsia-950 border-fuchsia-400', // Tone of Red-Violet

      // Shades (Darker)
      'bg-red-800/90 text-red-50 border-red-900', // Shade of Red
      'bg-orange-900/90 text-orange-50 border-black', // Shade of Red-Orange
      'bg-orange-800/90 text-orange-50 border-orange-900', // Shade of Orange
      'bg-amber-800/90 text-amber-50 border-amber-900', // Shade of Yellow-Orange
      'bg-yellow-700/90 text-yellow-50 border-yellow-800', // Shade of Yellow
      'bg-lime-800/90 text-lime-50 border-lime-900', // Shade of Yellow-Green
      'bg-green-800/90 text-green-50 border-green-900', // Shade of Green
      'bg-teal-800/90 text-teal-50 border-teal-900', // Shade of Blue-Green
      'bg-blue-800/90 text-blue-50 border-blue-900', // Shade of Blue
      'bg-indigo-800/90 text-indigo-50 border-indigo-900', // Shade of Blue-Violet
      'bg-violet-800/90 text-violet-50 border-violet-900', // Shade of Violet
      'bg-fuchsia-800/90 text-fuchsia-50 border-fuchsia-900' // Shade of Red-Violet
    ];
    
    // More varied and nuanced rotations for a truly organic, hand-placed wall aesthetic
    const rotations = [
      'rotate-1', '-rotate-1', 'rotate-2', '-rotate-2', 'rotate-3', '-rotate-3', 
      'rotate-[4deg]', '-rotate-[4deg]', 'rotate-[5deg]', '-rotate-[5deg]',
      'rotate-[0.5deg]', '-rotate-[0.5deg]', 'rotate-[1.5deg]', '-rotate-[1.5deg]',
      'skew-x-1', '-skew-x-1', 'rotate-[3.5deg]', '-rotate-[3.5deg]'
    ];

    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    const randomRotation = rotations[Math.floor(Math.random() * rotations.length)];

    let mainIdea = "Reflect";
    try {
      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Identify the single most impactful KEYWORD from this gratitude entry. 
        Note: DO NOT simply summarize the context and DO NOT necessarily pick the longest word. 
        Pick the precise word that is the core semantic anchor of the sentiment (e.g., if someone says "I love my coffee", the keyword is "Coffee").
        Entry: "${text}"
        Reply with ONLY that one keyword. No punctuation.`
      });
      
      const summarized = result.text?.trim().replace(/[^a-zA-Z]/g, '');
      if (summarized) {
        mainIdea = summarized.charAt(0).toUpperCase() + summarized.slice(1).toLowerCase();
      }
    } catch (err) {
      console.error("AI Summarization failed:", err);
    }

    try {
      await addDoc(collection(db, `users/${user.uid}/gratitudeList`), {
        userId: user.uid,
        text,
        date: new Date().toISOString(),
        color: randomColor,
        rotation: randomRotation,
        mainIdea
      });
    } catch (e) { console.error(e); }
  };

  const deleteGratitude = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, `users/${user.uid}/gratitudeList`, id));
    } catch (e) { console.error(e); }
  };

  if (authLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-obsidian">
        <motion.div 
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-12 h-12 rounded-full bg-emerald shadow-[0_0_40px_rgba(0,194,168,0.5)]"
        />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-obsidian p-6">
        <div className="luxury-glass max-w-md w-full p-10 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 m-4 w-32 h-32 bg-emerald/5 rounded-full blur-3xl pointer-events-none" />
          
          <div className="text-center mb-10">
            <motion.div 
              animate={{ y: [0, -5, 0] }} 
              transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
              className="relative w-28 h-28 mx-auto mb-6 group"
            >
              <div className="absolute inset-0 bg-emerald/20 blur-2xl rounded-full scale-125 animate-pulse" />
              <img 
                src="/SGPT_logo.jpg" 
                alt="Sanjeevani Logo" 
                className="w-full h-full rounded-3xl object-cover relative z-10 shadow-2xl border border-white/10"
                referrerPolicy="no-referrer"
              />
              <div className="absolute -bottom-2 -right-2 bg-obsidian p-2 rounded-full border border-emerald/50 z-20 shadow-lg group-hover:scale-110 transition-transform">
                <Heart size={16} className="text-emerald fill-emerald animate-pulse" />
              </div>
            </motion.div>
            <h1 className="font-serif text-4xl font-bold text-soft-white mb-2 tracking-tight">Sanjeevani <span className="text-emerald">GPT</span></h1>
            <p className="text-[10px] font-bold text-emerald tracking-[0.4em] uppercase opacity-80">Atmospheric Wellness Sanctuary</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-6">
            {authError && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }} 
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-3 text-xs text-red-400 bg-red-400/10 p-4 rounded-xl border border-red-400/20 shadow-lg mb-6"
              >
                <AlertCircle size={16} className="shrink-0" /> {authError}
              </motion.div>
            )}

            {!isLoginView && (
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-cool-light font-bold ml-2">Your Name</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-cool-light/50" size={18} />
                  <input 
                    type="text" 
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full bg-graphite/40 border border-slate-steel rounded-2xl py-4 pl-12 pr-4 text-sm text-soft-white focus:outline-none focus:border-emerald/50 transition-colors shadow-inner"
                  />
                </div>
              </div>
            )}
            
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-cool-light font-bold ml-2">Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-cool-light/50" size={18} />
                <input 
                  type="email" 
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full bg-graphite/40 border border-slate-steel rounded-2xl py-4 pl-12 pr-4 text-sm text-soft-white focus:outline-none focus:border-emerald/50 transition-colors shadow-inner"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-cool-light font-bold ml-2">Secret Code</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-cool-light/50" size={18} />
                <input 
                  type="password" 
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-graphite/40 border border-slate-steel rounded-2xl py-4 pl-12 pr-4 text-sm text-soft-white focus:outline-none focus:border-emerald/50 transition-colors shadow-inner"
                />
              </div>
            </div>

            <button 
              type="submit"
              className="w-full bg-gradient-to-r from-emerald to-indigo-elec text-soft-white py-4 rounded-2xl font-bold hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-emerald/10 border border-emerald/20 flex items-center justify-center gap-2 mt-4"
            >
              {isLoginView ? <LogIn size={18} /> : <UserPlus size={18} />}
              {isLoginView ? "Continue Securely" : "Create My Sanctuary"}
            </button>
          </form>

          <div className="mt-6 flex flex-col items-center gap-4">
            <div className="flex items-center gap-4 w-full">
              <div className="h-px bg-white/10 flex-1" />
              <span className="text-[10px] text-cool-light font-bold uppercase tracking-widest">Or connect via</span>
              <div className="h-px bg-white/10 flex-1" />
            </div>

            <button 
              onClick={handleGoogleLogin}
              className="w-full luxury-card py-4 rounded-2xl font-bold text-soft-white hover:bg-white/5 transition-all flex items-center justify-center gap-3 border border-white/5"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#EA4335" d="M12 5.04c1.64 0 3.12.56 4.28 1.67l3.19-3.19C17.47 1.59 14.94 1 12 1 7.42 1 3.5 3.57 1.5 7.42l3.74 2.9C6.11 7.21 8.84 5.04 12 5.04z" />
                <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.3h6.44c-.28 1.45-1.1 2.67-2.33 3.5l3.63 2.81c2.13-1.97 3.35-4.87 3.35-8.34z" />
                <path fill="#FBBC05" d="M5.24 14.52c-.22-.65-.35-1.35-.35-2.08a6.38 6.38 0 0 1 .35-2.08l-3.74-2.9A11.95 11.95 0 0 0 1 12.44 c0 1.95.47 3.79 1.3 5.42l3.94-3.34z" />
                <path fill="#34A853" d="M12 23c3.1 0 5.71-1.03 7.61-2.79l-3.63-2.81c-1.01.68-2.31 1.08-3.98 1.08-3.07 0-5.67-2.08-6.6-4.88l-3.94 3.34C3.78 20.21 7.55 23 12 23z" />
              </svg>
              Sign in with Google
            </button>
          </div>

          <p className="mt-8 text-center text-sm text-cool-light">
            {isLoginView ? "First time here?" : "Already a member?"}{" "}
            <button 
              onClick={() => {
                setIsLoginView(!isLoginView);
                setAuthError("");
              }}
              className="text-emerald font-bold hover:underline"
            >
              {isLoginView ? "Join Sanjeevani" : "Return Secretly"}
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen h-[100dvh] w-full flex flex-col md:flex-row p-0 md:p-6 gap-0 md:gap-6 overflow-hidden bg-obsidian relative">
      {/* Ultimate Cinematic Background */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <motion.div 
          animate={{ 
            scale: [1, 1.1, 1],
            rotate: [0, 360],
          }}
          transition={{ duration: 180, repeat: Infinity, ease: "linear" }}
          className="absolute top-[-20%] left-[-20%] w-[140%] h-[140%] bg-[radial-gradient(circle_at_50%_50%,rgba(0,209,178,0.06)_0%,transparent_70%)] blur-[60px] md:blur-[120px] -rotate-12"
        />
        <motion.div 
          animate={{ 
            scale: [1.1, 1, 1.1],
            rotate: [360, 0],
          }}
          transition={{ duration: 200, repeat: Infinity, ease: "linear" }}
          className="absolute bottom-[-20%] right-[-20%] w-[140%] h-[140%] bg-[radial-gradient(circle_at_50%_50%,rgba(99,102,241,0.06)_0%,transparent_70%)] blur-[60px] md:blur-[120px] rotate-12"
        />
        <div className="absolute top-1/4 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/5 to-transparent -rotate-[15deg] transform origin-left" />
        <div className="absolute bottom-1/4 right-0 w-full h-[1px] bg-gradient-to-l from-transparent via-white/5 to-transparent rotate-[25deg] transform origin-right" />
      </div>

      <div className="noise-overlay" />
      
      {/* Ethereal Mist Layer */}
      <motion.div 
        animate={{ opacity: [0.05, 0.1, 0.05] }}
        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
        className="fixed inset-0 pointer-events-none z-10 mix-blend-screen bg-[url('https://images.unsplash.com/photo-1519751138087-5bf79df62d5b?auto=format&fit=crop&q=80&w=2000&blur=100')] bg-cover" 
      />

      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 luxury-glass z-30 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-3">
          <img src="/SGPT_logo.jpg" alt="Logo" className="w-8 h-8 rounded-lg object-cover" />
          <h1 className="font-serif font-bold text-soft-white text-lg">Sanjeevani</h1>
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-soft-white">
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      <AnimatePresence>
        {insight && (
          <motion.div 
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
            className="fixed bottom-24 md:bottom-10 right-4 md:right-10 z-[100] luxury-glass p-6 pr-8 max-w-[280px] border-l-4 border-l-emerald shadow-2xl overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-2 opacity-20">
              <Sparkles size={12} className="animate-spin-slow" />
            </div>
            <p className="text-[10px] font-bold text-emerald uppercase tracking-[0.2em] mb-2 font-mono">Sanjeevani Insight</p>
            <p className="text-sm italic text-soft-white/90 leading-relaxed font-serif">"{insight.text}"</p>
            <motion.div 
              initial={{ width: "100%" }}
              animate={{ width: "0%" }}
              transition={{ duration: 8, ease: "linear" }}
              className="absolute bottom-0 left-0 h-1 bg-emerald/30"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sidebar - Hidden on mobile unless menu open */}
      <aside className={`fixed inset-y-0 left-0 w-72 luxury-glass flex flex-col p-6 shrink-0 z-40 transition-transform duration-300 md:relative md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:flex'}`}>
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald via-indigo-elec to-violet opacity-50" />
        
          <div className="mb-4 text-center px-4">
            <div className="mb-4 relative group inline-block">
              <div className="absolute inset-0 bg-emerald/20 blur-2xl rounded-full scale-150 animate-pulse" />
              <img 
                src="/SGPT_logo.jpg" 
                alt="Sanjeevani Logo" 
                className="w-16 h-16 mx-auto rounded-2xl object-cover relative z-10 shadow-2xl border border-white/10 group-hover:scale-110 transition-transform duration-500"
                referrerPolicy="no-referrer"
              />
              <div className="absolute -bottom-1 -right-1 bg-obsidian p-1 rounded-full border border-emerald/50 z-20 shadow-lg">
                <Heart size={10} className="text-emerald fill-emerald animate-pulse" />
              </div>
            </div>
            <div className="scale-90 -my-4">
              <SoulPrint evi={evi} color={atmosphericColor} />
            </div>
            <h2 className="text-lg font-bold text-soft-white font-serif tracking-tight mt-1 -skew-x-2">Sanjeevani <span className="text-emerald italic">GPT</span></h2>
            <div className="mt-1 flex items-center justify-center gap-2 -rotate-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald animate-pulse accent-glow" />
              <p className="text-[9px] font-bold text-cool-light tracking-widest uppercase italic">EVI: {evi}%</p>
            </div>
          </div>

        <div className="absolute top-48 -left-12 w-32 h-64 bg-emerald/5 -rotate-[35deg] blur-3xl pointer-events-none" />
        <div className="absolute bottom-20 -right-12 w-32 h-64 bg-violet/5 rotate-[45deg] blur-3xl pointer-events-none" />

        <nav className="flex flex-col gap-2 flex-1 relative z-10 overflow-y-auto no-scrollbar pb-6 mt-4">
          <div className="hidden md:flex items-center justify-between mb-1 ml-3 px-2">
            <div className="text-[10px] uppercase tracking-wider text-cool-light font-bold py-1 bg-slate-steel/30 rounded inline-block w-fit">Wellness Suite</div>
            <button 
              onClick={() => { handleNewConversation(); setIsMobileMenuOpen(false); }}
              className="p-1 px-2 text-[10px] bg-emerald/20 hover:bg-emerald text-emerald hover:text-soft-white rounded border border-emerald/20 transition-all font-bold uppercase tracking-widest"
            >
              + New
            </button>
          </div>
          
          <motion.button 
            whileHover={{ x: 4 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setActiveTab("chat")}
            className={`p-3 rounded-xl flex items-center gap-3 text-sm font-semibold transition-all text-left ${activeTab === 'chat' ? 'bg-emerald/10 border border-emerald/20 text-soft-white' : 'text-cool-light hover:bg-white/5 hover:text-soft-white'}`}
          >
            <span className={`w-2 h-2 rounded-full ${activeTab === 'chat' ? 'bg-emerald accent-glow animate-pulse' : 'bg-slate-steel'}`}></span> Mindful Chat
          </motion.button>

          {activeTab === "chat" && conversations.length > 0 && (
            <div className="flex flex-col gap-2 ml-4 mb-2 border-l border-white/5 pl-3">
              {conversations.map(conv => (
                <motion.div 
                  initial={{ opacity: 0, x: -5 }}
                  animate={{ opacity: 1, x: 0 }}
                  key={conv.id} 
                  className="group flex items-center justify-between gap-1 pr-1"
                >
                  <button
                    onClick={() => selectConversation(conv.id)}
                    className={`text-[10px] py-2 px-3 rounded-lg text-left truncate flex-1 transition-all ${activeConversationId === conv.id ? 'bg-white/10 text-soft-white' : 'text-cool-light hover:text-soft-white hover:bg-white/5'}`}
                  >
                    {conv.title}
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                    className="p-1 px-2 text-cool-light/30 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Delete Conversation"
                  >
                    <Trash2 size={12} />
                  </button>
                </motion.div>
              ))}
              
              <button 
                onClick={clearAllHistory}
                className="mt-2 text-[9px] uppercase tracking-widest text-red-400/50 hover:text-red-400 font-bold py-1 px-3 border border-red-400/10 hover:border-red-400/30 rounded-lg transition-all text-center w-full"
              >
                Clear All History
              </button>
            </div>
          )}

          <motion.button 
            whileHover={{ x: 4 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setActiveTab("journal")}
            className={`p-3 rounded-xl flex items-center gap-3 text-sm font-semibold transition-all text-left ${activeTab === 'journal' ? 'bg-indigo-elec/10 border border-indigo-elec/20 text-soft-white' : 'text-cool-light hover:bg-white/5 hover:text-soft-white'}`}
          >
            <span className={`w-2 h-2 rounded-full ${activeTab === 'journal' ? 'bg-indigo-elec animate-pulse' : 'bg-slate-steel'}`}></span> Mood Journal
          </motion.button>
          <motion.button 
            whileHover={{ x: 4 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setActiveTab("breath")}
            className={`p-3 rounded-xl flex items-center gap-3 text-sm font-semibold transition-all text-left ${activeTab === 'breath' ? 'bg-violet/10 border border-violet/20 text-soft-white' : 'text-cool-light hover:bg-white/5 hover:text-soft-white'}`}
          >
            <span className={`w-2 h-2 rounded-full ${activeTab === 'breath' ? 'bg-violet animate-pulse' : 'bg-slate-steel'}`}></span> Breathwork
          </motion.button>
          <motion.button 
            whileHover={{ x: 4 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setActiveTab("gratitude")}
            className={`p-3 rounded-xl flex items-center gap-3 text-sm font-semibold transition-all text-left ${activeTab === 'gratitude' ? 'bg-champagne/10 border border-champagne/20 text-soft-white' : 'text-cool-light hover:bg-white/5 hover:text-soft-white'}`}
          >
            <span className={`w-2 h-2 rounded-full ${activeTab === 'gratitude' ? 'bg-champagne animate-pulse' : 'bg-slate-steel'}`}></span> Gratitude Wall
          </motion.button>
        </nav>

        <div className="space-y-4">
          <div className="luxury-card p-4 rounded-2xl relative group">
            <p className="text-[11px] text-emerald mb-2 font-bold tracking-widest uppercase">My Profile</p>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald/10 flex items-center justify-center text-emerald text-xs font-bold ring-1 ring-emerald/20">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-bold text-soft-white truncate">{user.name}</p>
                <p className="text-[10px] text-cool-light truncate">{user.email}</p>
              </div>
            </div>
          </div>

          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 p-3 rounded-xl text-xs font-bold text-cool-light hover:text-red-400 hover:bg-red-400/5 transition-all border border-transparent hover:border-red-400/10"
          >
            <LogOut size={14} /> Logout Securely
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col gap-6 overflow-hidden relative">
        {/* Header - Hidden on mobile except for central context */}
        <header className={`${activeTab === 'chat' ? 'flex' : 'hidden md:flex'} luxury-glass h-16 md:h-20 px-4 md:px-8 items-center justify-between shrink-0 shadow-xl z-20`}>
          <div className="flex items-center gap-2 md:gap-4 overflow-hidden">
            <div className="relative shrink-0">
              <div className={`w-2.5 h-2.5 md:w-3 md:h-3 rounded-full border-2 border-graphite absolute bottom-0 right-0 z-10 accent-glow ${activeTab === 'chat' ? 'bg-emerald' : activeTab === 'journal' ? 'bg-indigo-elec' : activeTab === 'breath' ? 'bg-violet' : 'bg-champagne'}`}></div>
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-graphite border border-slate-steel flex items-center justify-center font-bold text-emerald shadow-sm overflow-hidden">
                <span className={`bg-gradient-to-br bg-clip-text text-transparent ${activeTab === 'chat' ? 'from-emerald to-violet' : 'from-indigo-elec to-champagne'}`}>
                  {activeTab === 'chat' ? 'S' : activeTab.charAt(0).toUpperCase()}
                </span>
              </div>
            </div>
            <div className="min-w-0">
              <h1 className="text-xs md:text-sm font-bold text-soft-white tracking-wide -skew-x-2 truncate">
                {activeTab === 'chat' ? 'Sanjeevani Empathy Engine' : activeTab === 'journal' ? 'Reflective Journal' : activeTab === 'breath' ? 'Harmonized Breath' : 'Gratitude Sanctuary'}
              </h1>
              <p className="text-[8px] md:text-[10px] text-cool-light font-medium uppercase tracking-tighter truncate">Private session for <span className="text-emerald">{user.name}</span></p>
            </div>
          </div>
          <div className="flex gap-2 md:gap-3 items-center shrink-0">
            <div 
              style={{ color: atmosphericColor, border: `1px solid ${atmosphericColor}22` }}
              className="px-2 md:px-3 py-1 md:py-1.5 luxury-card rounded-full text-[8px] md:text-[10px] font-bold tracking-wider uppercase flex items-center gap-1.5 md:gap-2 whitespace-nowrap"
            >
              <Heart size={10} className="animate-pulse md:w-[12px] md:h-[12px]" /> <span className="hidden xs:inline">Resonating</span>
            </div>
            {activeTab === 'chat' && (
              <button 
                onClick={() => setMessages([{
                  role: "model",
                  text: "Namaste. I have cleared our current active thoughts. I am ready to listen whenever you're prepared.",
                  timestamp: new Date().toISOString(),
                }])}
                className="p-2 hover:bg-emerald/10 hover:text-emerald rounded-lg transition-all text-cool-light border border-transparent hover:border-emerald/20"
                title="Clear Session"
              >
                <RefreshCw size={16} />
              </button>
            )}
            <button 
              onClick={() => setShowDisclaimer(true)}
              className="p-2 hover:bg-violet/10 hover:text-violet rounded-lg transition-all text-cool-light border border-transparent hover:border-violet/20"
              title="Information"
            >
              <Info size={16} />
            </button>
          </div>
        </header>

        {/* Content Area Rendering */}
        <div className="flex-1 overflow-hidden relative z-20">
          <AnimatePresence mode="wait">
            {activeTab === 'chat' && (
              <div className="h-full smooth-reveal">
                <ChatView 
                  messages={messages} 
                  scrollRef={scrollRef} 
                  isLoading={isLoading} 
                  input={input} 
                  setInput={setInput} 
                  handleSend={sendMessage} 
                  user={user} 
                  evi={evi}
                  atmosphericColor={atmosphericColor}
                />
              </div>
            )}
            {activeTab === 'journal' && (
              <div className="h-full smooth-reveal">
                <JournalView 
                  moodHistory={moodHistory} 
                  addMood={addMood} 
                  deleteMood={deleteMood} 
                  ai={ai}
                />
              </div>
            )}
            {activeTab === 'breath' && (
              <div className="h-full smooth-reveal">
                <BreathView />
              </div>
            )}
            {activeTab === 'gratitude' && (
              <div className="h-full smooth-reveal">
                <GratitudeView 
                  list={gratitudeList} 
                  addGratitude={addGratitude}
                  deleteGratitude={deleteGratitude}
                />
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Mobile Bottom Navigation */}
        <div className="md:hidden flex items-center justify-around p-3 luxury-glass z-30 border-t border-white/5 bg-obsidian safe-bottom">
          {[
            { id: 'chat', icon: MessageCircle },
            { id: 'journal', icon: BookOpen },
            { id: 'breath', icon: Wind },
            { id: 'gratitude', icon: Heart }
          ].map(item => (
            <button 
              key={item.id}
              onClick={() => { setActiveTab(item.id as Tab); setIsMobileMenuOpen(false); }}
              className={`p-2.5 rounded-full transition-all ${activeTab === item.id ? 'bg-emerald/20 text-emerald scale-110' : 'text-cool-light hover:text-soft-white'}`}
            >
              <item.icon size={22} />
            </button>
          ))}
        </div>
      </main>

      {/* Disclaimer Modal */}
      <AnimatePresence>
        {showDisclaimer && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-obsidian/80 backdrop-blur-xl"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 40, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 40, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="luxury-glass max-w-md w-full p-10 shadow-2xl space-y-8 !bg-graphite/90 border-white/10 relative"
            >
              <div className="absolute top-0 right-0 m-4 w-20 h-20 bg-emerald/5 rounded-full blur-3xl pointer-events-none" />
              
              <div className="flex items-center gap-5">
                <div className="relative">
                  <div className="absolute inset-0 bg-emerald/20 blur-xl rounded-full scale-110 animate-pulse" />
                  <img 
                    src="/SGPT_logo.jpg" 
                    alt="Sanjeevani Logo" 
                    className="w-16 h-16 rounded-2xl object-cover relative z-10 shadow-xl border border-white/10"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div>
                  <h2 className="font-serif text-3xl font-bold text-soft-white">Namaste</h2>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-emerald opacity-80">Wellness Sanctuary</p>
                </div>
              </div>

              <div className="space-y-5 text-sm leading-relaxed text-cool-light/80">
                <p>
                  Welcome to <strong className="text-soft-white font-serif">Sanjeevani</strong>. 
                  This is your private space to breathe, reflect, and just be yourself.
                </p>
                <div className="flex gap-4 p-5 bg-emerald/5 border border-emerald/10 rounded-2xl">
                  <Heart className="shrink-0 text-emerald" size={20} />
                  <p className="text-xs font-medium text-cool-light/90 italic">
                    "I am here to offer empathy and wellness guidance. While I'm not a doctor, I am a dedicated companion for your journey."
                  </p>
                </div>
                <p className="font-medium text-soft-white/60 text-center text-xs">
                  If you need urgent clinical help, please contact your local emergency services.
                </p>
              </div>

              <button 
                onClick={() => setShowDisclaimer(false)}
                className="w-full bg-gradient-to-r from-emerald/80 to-indigo-elec/80 text-soft-white py-5 rounded-2xl font-bold hover:from-emerald hover:to-indigo-elec active:scale-95 transition-all flex items-center justify-center gap-3 shadow-xl shadow-emerald/5 border border-white/5 group"
              >
                Enter the Sanctuary <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SoulPrint({ evi, color }: { evi: number, color: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;
    
    let animationFrameId: number;
    let time = 0;
    
    const dpr = window.devicePixelRatio || 1;
    canvas.width = 160 * dpr;
    canvas.height = 160 * dpr;
    ctx.scale(dpr, dpr);
    
    const render = () => {
      time += 0.012;
      ctx.clearRect(0, 0, 160, 160);
      
      const centerX = 80;
      const centerY = 80;
      const baseRadius = 38 + (evi / 8);
      
      // Dynamic Ethereal Aura
      const auraGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 75);
      auraGrad.addColorStop(0, `${color}25`);
      auraGrad.addColorStop(0.5, `${color}08`);
      auraGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = auraGrad;
      ctx.beginPath();
      ctx.arc(centerX, centerY, 75, 0, Math.PI * 2);
      ctx.fill();

      for (let layer = 0; layer < 4; layer++) {
        ctx.beginPath();
        const opacity = Math.max(0.1, 0.4 - layer * 0.08);
        ctx.strokeStyle = `${color}${Math.floor(opacity * 255).toString(16).padStart(2, '0')}`;
        ctx.lineWidth = 1.4 - layer * 0.25;
        ctx.lineCap = 'round';
        ctx.shadowBlur = 10;
        ctx.shadowColor = color;
        
        for (let angle = 0; angle < Math.PI * 2; angle += 0.02) {
          const frequency = 2 + layer * 0.6;
          const amplitude = (8 + layer * 2) * (evi / 100);
          
          const noise = Math.sin(angle * frequency + time * (0.6 + layer * 0.1)) * amplitude +
                        Math.cos(angle * (frequency + 2) - time * 0.5) * (amplitude / 2);
          
          const r = baseRadius + noise;
          const x = centerX + Math.cos(angle) * r;
          const y = centerY + Math.sin(angle) * r;
          
          if (angle === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      }
      
      animationFrameId = requestAnimationFrame(render);
    };
    
    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [evi, color]);
  
  return (
    <div className="relative group flex items-center justify-center -mb-4 -mt-4">
      <div className="absolute inset-0 bg-white/5 blur-3xl rounded-full scale-110 opacity-0 group-hover:opacity-100 transition-opacity duration-1000 pointer-events-none" />
      <canvas ref={canvasRef} className="w-40 h-40 drop-shadow-[0_0_25px_rgba(0,209,178,0.25)] relative z-10" />
      <div className="absolute inset-x-0 bottom-6 text-[8px] font-mono text-soft-white/10 select-none pointer-events-none tracking-[0.5em] uppercase">Vibrancy</div>
    </div>
  );
}

// Sub-components for better organization

function ChatView({ messages, scrollRef, isLoading, input, setInput, handleSend, user, evi, atmosphericColor }: any) {
  return (
    <motion.section 
      key="chat"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="h-full flex flex-col p-4 md:p-8 luxury-glass overflow-hidden shadow-2xl"
    >
      <div 
        ref={scrollRef}
        className="flex-1 space-y-8 overflow-y-auto pr-2 scrollbar-thin scrollbar-track-transparent scroll-smooth px-2 md:px-4 no-scrollbar"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {messages.map((message: any, index: number) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ 
                duration: 0.8, 
                delay: index === messages.length - 1 ? 0 : 0.05,
                type: "spring",
                damping: 25,
                stiffness: 120
              }}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div 
                className={`max-w-[90%] md:max-w-xl p-4 md:p-6 shadow-xl relative group transition-all duration-500 ${
                  message.role === "user" 
                    ? "chat-bubble-user-luxury text-soft-white rounded-2xl md:rounded-[2.5rem] rounded-tr-none" 
                    : "chat-bubble-bot-luxury text-soft-white/90 font-serif text-base md:text-lg leading-relaxed rounded-2xl md:rounded-[2.5rem] rounded-tl-none hover:bg-white/[0.05]"
                }`}
              >
                {message.role === "model" && (
                  <div className="absolute -left-6 md:-left-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-40 transition-opacity pointer-events-none">
                    <div className="w-3 md:w-4 h-3 md:h-4 rounded-full bg-emerald/20 blur-md animate-pulse" />
                  </div>
                )}
                <div className="markdown-body text-sm md:text-base">
                  <ReactMarkdown>{message.text}</ReactMarkdown>
                </div>
                <div className={`mt-4 text-[10px] opacity-20 flex items-center gap-2 font-mono tracking-tighter ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className="h-px w-3 bg-current opacity-20" />
                  <span>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-start"
          >
            <div className="chat-bubble-bot-luxury px-6 py-4">
              <div className="flex gap-2">
                {[0, 1, 2].map(i => (
                  <motion.div 
                    key={i}
                    animate={{ 
                      scale: [1, 1.3, 1], 
                      backgroundColor: ["#2A2F36", "#00C2A8", "#2A2F36"] 
                    }} 
                    transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2 }}
                    className="w-1.5 h-1.5 rounded-full" 
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </div>

      <div className="mt-2 md:mt-6 flex gap-3 overflow-x-auto pb-2 no-scrollbar px-4">
        {["Can you suggest a quick breathing exercise?", "I'm struggling with a thought, help me reframe it.", "How can I handle overwhelm today?"].map((suggestion) => (
          <button 
            key={suggestion}
            onClick={() => setInput(suggestion)}
            className="text-[9px] md:text-[10px] font-bold px-3 md:px-4 py-1.5 md:py-2 luxury-card rounded-full text-cool-light hover:text-emerald hover:border-emerald/30 transition-all whitespace-nowrap tracking-widest uppercase border-slate-steel/50"
          >
            {suggestion.split(' ').slice(0, 3).join(' ')}...
          </button>
        ))}
      </div>

      <div className="mt-2 md:mt-6 pt-2 md:pt-6 border-t border-slate-steel/50 px-4 mb-2">
        <div className="relative flex items-center group">
          <textarea 
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (input.trim()) handleSend(input);
              }
            }}
            placeholder="Whisper..." 
            className="w-full bg-graphite/40 border border-slate-steel/50 rounded-xl md:rounded-2xl py-3 md:py-4 px-4 md:px-6 pr-12 md:pr-14 text-xs md:text-sm focus:outline-none focus:ring-1 focus:ring-emerald/30 text-soft-white resize-none min-h-[50px] md:min-h-[60px] max-h-32"
          />
          <button 
            onClick={() => handleSend(input)}
            disabled={!input.trim() || isLoading}
            className={`absolute right-3 bottom-3 w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transition-all ${
              !input.trim() || isLoading ? "bg-slate-steel/50 text-cool-light/30" : "bg-gradient-to-br from-emerald to-indigo-elec text-soft-white shadow-emerald/10"
            }`}
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
    </motion.section>
  );
}

function JournalView({ moodHistory, addMood, deleteMood, ai }: any) {
  const [note, setNote] = useState("");
  const [mood, setMood] = useState(3);
  const [isGenerating, setIsGenerating] = useState(false);
  const [prompt, setPrompt] = useState("What's one thing you learned about yourself today?");

  const handleSave = () => {
    if (!note.trim()) return;
    addMood(mood, note);
    setNote("");
    setMood(3);
  };

  const generatePrompt = async () => {
    setIsGenerating(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: "user", parts: [{ text: "Give me a single, deeply reflective journaling prompt for mental wellness. Keep it under 20 words." }] }],
      });
      setPrompt(response.text || prompt);
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <motion.section 
      key="journal"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="h-full flex flex-col p-4 md:p-8 luxury-glass overflow-hidden shadow-2xl"
    >
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 md:gap-8 h-full overflow-hidden">
        <div className="lg:col-span-3 flex flex-col gap-4 md:gap-6 overflow-y-auto md:overflow-hidden pb-4 md:pb-0">
          <div className="luxury-card p-5 md:p-8 rounded-3xl space-y-4 md:space-y-6 relative overflow-hidden shrink-0">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald/5 blur-3xl -rotate-12 pointer-events-none" />
            <div className="flex justify-between items-start gap-2 relative z-10">
              <h3 className="text-xs md:text-sm text-soft-white font-bold flex items-center gap-2 italic -skew-x-2 leading-tight">
                <Sparkles size={14} className="text-emerald animate-pulse shrink-0" /> {prompt}
              </h3>
              <button 
                onClick={generatePrompt}
                disabled={isGenerating}
                className="p-2 hover:bg-emerald/10 rounded-lg text-emerald transition-all"
              >
                <RefreshCw size={14} className={isGenerating ? "animate-spin" : ""} />
              </button>
            </div>
            
            <div className="flex justify-between gap-2">
              {[
                { val: 1, icon: Frown, color: "text-red-400", label: "Rough" },
                { val: 2, icon: Frown, color: "text-orange-400", label: "Low" },
                { val: 3, icon: Meh, color: "text-yellow-400", label: "Okay" },
                { val: 4, icon: Smile, color: "text-emerald", label: "Good" },
                { val: 5, icon: Smile, color: "text-mint", label: "Great" },
              ].map((m) => (
                <button 
                  key={m.val}
                  onClick={() => setMood(m.val)}
                  className={`flex-1 p-3 rounded-2xl border transition-all flex flex-col items-center gap-1 ${mood === m.val ? 'bg-emerald/10 border-emerald shadow-lg shadow-emerald/10 scale-105' : 'bg-graphite/40 border-slate-steel hover:border-emerald/30'}`}
                >
                  <m.icon size={20} className={mood === m.val ? m.color : "text-cool-light"} />
                  <span className="text-[10px] font-bold text-cool-light">{m.label}</span>
                </button>
              ))}
            </div>

            <textarea 
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Spill your thoughts here..."
              className="w-full bg-graphite/40 border border-slate-steel/50 rounded-2xl p-4 text-sm focus:outline-none focus:border-emerald/50 text-soft-white resize-none h-40"
            />

            <button 
              onClick={handleSave}
              className="w-full bg-emerald text-soft-white py-3 rounded-2xl font-bold flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-emerald/10"
            >
              <Plus size={18} /> Save Entry
            </button>
          </div>
        </div>

        <div className="lg:col-span-2 flex flex-col gap-4 overflow-hidden mb-12 lg:mb-0">
          <h4 className="text-[10px] uppercase tracking-[0.2em] text-cool-light font-bold flex items-center gap-2">
            <History size={12} /> Recent Reflections
          </h4>
          <div className="flex-1 overflow-y-auto space-y-4 pr-2 scrollbar-thin">
            {moodHistory.length === 0 && (
              <div className="p-8 text-center text-cool-light/50 text-sm italic">No entries yet. Start reflecting...</div>
            )}
            {moodHistory.map((entry: any) => {
              const moodColors: Record<number, string> = {
                1: "border-l-red-500 bg-red-500/5 text-red-400",
                2: "border-l-orange-500 bg-orange-500/5 text-orange-400",
                3: "border-l-yellow-500 bg-yellow-500/5 text-yellow-400",
                4: "border-l-emerald bg-emerald/5 text-emerald",
                5: "border-l-mint bg-mint/5 text-mint"
              };
              const colorClass = moodColors[entry.mood as number] || "border-l-emerald bg-emerald/5 text-emerald";
              
              return (
                <div key={entry.id} className={`luxury-card p-4 rounded-2xl border-l-4 shadow-sm transition-all hover:translate-x-1 ${colorClass}`}>
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-lg bg-current opacity-20 absolute`} />
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-mono font-bold z-10">
                        {entry.mood}
                      </div>
                      <span className="text-[10px] text-cool-light font-bold font-mono">
                        {new Date(entry.date).toLocaleDateString()}
                      </span>
                    </div>
                    <button 
                      onClick={() => deleteMood(entry.id)}
                      className="text-cool-light/30 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <p className="text-xs text-soft-white/80 line-clamp-3 leading-relaxed">{entry.note}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </motion.section>
  );
}

function BreathView() {
  const [activeTechnique, setActiveTechnique] = useState(0);
  const [phase, setPhase] = useState("Get Ready");
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(4);
  const [scaleTarget, setScaleTarget] = useState(1);

  const techniques = [
    { 
      name: "Box Breathing", 
      desc: "For balance and focus",
      phases: [
        { name: "Inhale", time: 4 },
        { name: "Hold", time: 4 },
        { name: "Exhale", time: 4 },
        { name: "Hold", time: 4 }
      ]
    },
    { 
      name: "4-7-8 Breathing", 
      desc: "For deep relaxation and sleep",
      phases: [
        { name: "Inhale", time: 4 },
        { name: "Hold", time: 7 },
        { name: "Exhale", time: 8 }
      ]
    },
    { 
      name: "Equal Breathing", 
      desc: "For calming the nervous system",
      phases: [
        { name: "Inhale", time: 4 },
        { name: "Exhale", time: 4 }
      ]
    }
  ];

  useEffect(() => {
    let timer: any;
    let phaseIndex = 0;
    const currentTechnique = techniques[activeTechnique];
    
    const startPhase = () => {
      const currentPhase = currentTechnique.phases[phaseIndex];
      setPhase(currentPhase.name);
      setDuration(currentPhase.time);
      
      // Calculate where the scale should end up or stay
      if (currentPhase.name === "Hold") {
        const prevIdx = (phaseIndex - 1 + currentTechnique.phases.length) % currentTechnique.phases.length;
        setScaleTarget(currentTechnique.phases[prevIdx].name === "Inhale" ? 1.4 : 1);
      } else {
        setScaleTarget(currentPhase.name === "Inhale" ? 1.4 : 1);
      }
      
      let elapsed = 0;
      const step = 100; // 100ms for smoother progress
      const totalMs = currentPhase.time * 1000;
      
      timer = setInterval(() => {
        elapsed += step;
        const p = (elapsed / totalMs) * 100;
        
        if (currentPhase.name === "Inhale") setProgress(p);
        else if (currentPhase.name === "Exhale") setProgress(100 - p);
        else if (currentPhase.name === "Hold") setProgress(100);
        
        if (elapsed >= totalMs) {
          clearInterval(timer);
          phaseIndex = (phaseIndex + 1) % currentTechnique.phases.length;
          startPhase();
        }
      }, step);
    };

    const initialTimeout = setTimeout(startPhase, 1000);
    return () => {
      clearInterval(timer);
      clearTimeout(initialTimeout);
    };
  }, [activeTechnique]);

  return (
    <motion.section 
      key="breath"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-full flex items-center justify-center luxury-glass p-8 relative overflow-hidden"
    >
      {/* Abstract Background Animation */}
      <motion.div 
        animate={{ 
          scale: [1, 1.2, 1],
          opacity: [0.05, 0.1, 0.05]
        }}
        transition={{ duration: duration * 2, repeat: Infinity, ease: "easeInOut" }}
        className="absolute inset-0 bg-gradient-to-tr from-emerald/20 via-indigo-elec/10 to-violet/20 blur-[120px] pointer-events-none"
      />

      <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-16 items-center relative z-10">
        <div className="flex flex-col gap-8 order-2 md:order-1">
          <div className="space-y-2 -skew-x-2">
            <h3 className="text-3xl font-serif font-bold text-soft-white select-none">Breathe with <span className="italic text-emerald">Me</span></h3>
            <p className="text-cool-light text-xs font-bold tracking-widest uppercase opacity-60">Harmonize Your Presence</p>
          </div>

          <div className="space-y-4">
            {techniques.map((tech, idx) => (
              <button 
                key={idx}
                onClick={() => {
                  setActiveTechnique(idx);
                  setProgress(0);
                }}
                className={`w-full p-6 p-4 rounded-3xl text-left border transition-all relative overflow-hidden group ${activeTechnique === idx ? 'bg-white/5 border-emerald/50' : 'bg-transparent border-white/5 hover:border-white/10'}`}
              >
                {activeTechnique === idx && (
                  <motion.div 
                    layoutId="activeGlow"
                    className="absolute inset-0 bg-emerald/5 pointer-events-none"
                  />
                )}
                <div className="flex justify-between items-center mb-1">
                  <h4 className={`font-bold tracking-tight ${activeTechnique === idx ? 'text-emerald' : 'text-soft-white'}`}>{tech.name}</h4>
                  {activeTechnique === idx && <motion.div layoutId="activeDot" className="w-1.5 h-1.5 rounded-full bg-emerald" />}
                </div>
                <p className="text-xs text-cool-light">{tech.desc}</p>
                <div className="mt-3 flex gap-1">
                  {tech.phases.map((p, pidx) => (
                    <div key={pidx} className="h-1 flex-1 bg-white/5 rounded-full overflow-hidden">
                      <div className={`h-full opacity-40 ${activeTechnique === idx ? 'bg-emerald' : 'bg-cool-light'}`} style={{ width: '100%' }} />
                    </div>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center justify-center order-1 md:order-2">
          <div className="relative flex items-center justify-center">
            <motion.div 
              animate={{ 
                scale: phase === "Inhale" ? [1, 1.4] : phase === "Exhale" ? [1.4, 1] : scaleTarget,
                opacity: phase === "Inhale" ? [0.2, 0.4] : phase === "Exhale" ? [0.4, 0.2] : 0.4
              }}
              transition={{ duration: duration, ease: "easeInOut" }}
              className="w-72 h-72 bg-emerald/10 rounded-full blur-3xl absolute"
            />
            
            <motion.div 
              animate={{ 
                scale: phase === "Inhale" ? [1, 1.3] : phase === "Exhale" ? [1.3, 1] : (scaleTarget > 1 ? 1.3 : 1),
                borderColor: phase === "Inhale" ? "#00C2A8" : phase === "Exhale" ? "#6E5BFF" : phase === "Hold" ? "#FFD700" : "#EDEFF2"
              }}
              transition={{ duration: duration, ease: "easeInOut" }}
              className="w-80 h-80 border-2 rounded-full flex flex-col items-center justify-center relative z-20 backdrop-blur-sm bg-white/5 shadow-2xl"
            >
              <AnimatePresence mode="wait">
                <motion.div 
                  key={phase}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="text-center"
                >
                  <h4 className="text-4xl font-serif font-bold text-soft-white mb-2">{phase}</h4>
                  <div className="text-[10px] uppercase tracking-[0.3em] font-bold text-cool-light flex items-center justify-center gap-2">
                    <History size={10} className="animate-spin-slow" /> {duration} Seconds
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Progress Ring */}
              <svg className="absolute inset-x-0 -top-0 w-full h-full -rotate-90 pointer-events-none">
                <circle
                  cx="160"
                  cy="160"
                  r="158"
                  className="stroke-white/5 fill-none"
                  strokeWidth="2"
                />
                <motion.circle
                  cx="160"
                  cy="160"
                  r="158"
                  className="stroke-emerald/30 fill-none"
                  strokeWidth="4"
                  strokeDasharray="1000"
                  animate={{ strokeDashoffset: 1000 - (progress * 10) }}
                  transition={{ ease: "linear" }}
                />
              </svg>
            </motion.div>
          </div>
          
          <div className="mt-12 text-center">
            <p className="text-xs text-cool-light/60 max-w-[200px] italic leading-relaxed">
              Find a comfortable position and let your body follow the rhythm.
            </p>
          </div>
        </div>
      </div>
    </motion.section>
  );
}

function GratitudeView({ list, addGratitude, deleteGratitude }: any) {
  const [text, setText] = useState("");

  const handleSave = () => {
    if (!text.trim()) return;
    addGratitude(text);
    setText("");
  };

  return (
    <motion.section 
      key="gratitude"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-full flex flex-col p-4 md:p-8 luxury-glass overflow-hidden shadow-2xl relative"
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(#ffffff05_1px,transparent_1px)] [background-size:20px_20px] pointer-events-none" />

      <div className="max-w-[1300px] mx-auto w-full flex flex-col h-full relative z-10">
        <div className="text-center mb-6 md:mb-10 space-y-2 -skew-x-2">
          <h3 className="text-2xl md:text-4xl font-serif font-bold text-soft-white tracking-tight">The Wall of <span className="italic text-champagne">Gratitude</span></h3>
          <p className="text-cool-light text-[8px] md:text-[10px] uppercase font-bold tracking-[0.2em] opacity-70 px-4">A collective of light, one note at a time.</p>
        </div>

        {/* Input Bar */}
        <div className="max-w-xl mx-auto w-full mb-8 md:mb-12 px-4">
          <div className="relative group">
            <input 
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              placeholder="What are you thankful for?"
              className="w-full bg-graphite/40 border border-slate-steel/50 rounded-xl md:rounded-2xl py-3 md:py-5 px-5 md:px-6 pr-14 md:pr-16 text-base md:text-lg focus:outline-none focus:border-champagne/50 italic text-soft-white shadow-xl backdrop-blur-md"
            />
            <button 
              onClick={handleSave}
              className="absolute right-2 md:right-3 top-1/2 -translate-y-1/2 w-8 h-8 md:w-10 md:h-10 bg-champagne text-obsidian rounded-lg md:rounded-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>

        {/* The Wall */}
        <div className="flex-1 overflow-y-auto pr-2 no-scrollbar pb-20">
          <div className="flex flex-wrap items-start justify-center gap-4 content-start">
            {list.length === 0 && (
              <div className="w-full py-20 text-center">
                <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Sun size={32} className="text-cool-light/20 rotate-45" />
                </div>
                <p className="text-cool-light/30 uppercase tracking-[0.3em] text-[10px] font-bold">The wall is waiting for your light</p>
              </div>
            )}
            <AnimatePresence>
              {list.map((item: any) => (
                <GratitudeNote key={item.id} item={item} deleteGratitude={deleteGratitude} />
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.section>
  );
}

function GratitudeNote({ item, deleteGratitude }: { item: any, deleteGratitude: (id: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  
  const getMainIdea = (text: string) => {
    const stopWords = new Set(['i', 'am', 'the', 'a', 'an', 'and', 'but', 'if', 'or', 'as', 'what', 'which', 'this', 'that', 'these', 'those', 'then', 'just', 'so', 'for', 'with', 'in', 'on', 'at', 'by', 'today', 'was', 'were', 'is', 'it', 'my', 'me', 'am', 'was', 'very', 'really', 'feel', 'feeling', 'grateful', 'thankful']);
    const words = text.trim().toLowerCase().split(/\s+/).map(w => w.replace(/[^a-z]/g, '')).filter(w => w.length > 2);
    const substantialWords = words.filter(w => !stopWords.has(w));
    
    // Pick the first substantial word instead of the longest one, as it's often the primary subject/action
    if (substantialWords.length > 0) {
      const main = substantialWords[0];
      return main.charAt(0).toUpperCase() + main.slice(1);
    }
    return words.length > 0 ? words[0].charAt(0).toUpperCase() + words[0].slice(1) : "Reflect";
  };

  const title = item.mainIdea || getMainIdea(item.text);

  return (
    <motion.div 
      layout
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.9, opacity: 0 }}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onClick={() => setIsOpen(!isOpen)}
      className={`relative p-4 h-[160px] w-[160px] md:h-[180px] md:w-[180px] flex flex-col shadow-lg border-b-2 border-r-2 ${item.color || 'bg-amber-100/90 text-amber-900 border-amber-200'} ${item.rotation || 'rotate-0'} transition-all duration-500 cursor-default group m-2 overflow-hidden shrink-0`}
      style={{ transformOrigin: 'top center' }}
    >
      <button 
        onClick={(e) => { e.stopPropagation(); deleteGratitude(item.id); }}
        className="absolute top-1 right-1 opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity p-1 z-20"
      >
        <Trash2 size={10} />
      </button>

      {/* Sticky Tape Effect at Top */}
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-black/5 pointer-events-none z-10" />
      
      <div className="flex flex-col h-full relative z-0">
        <motion.div layout className="mb-1">
          <span className="text-[8px] font-bold uppercase tracking-[0.1em] opacity-40 block mb-0.5">
            {new Date(item.date).toLocaleDateString([], { month: 'short', day: 'numeric' })}
          </span>
          
          <motion.h4 
            layout
            className={`font-serif font-bold text-lg leading-tight transition-all duration-700 ${isOpen ? 'opacity-5 blur-sm translate-y-1' : 'opacity-100'}`}
          >
            {title}
          </motion.h4>
        </motion.div>

        <div className="relative flex-1">
          <motion.div
            initial={false}
            animate={{ 
              height: isOpen ? '100%' : '0%',
              opacity: isOpen ? 1 : 0,
              scaleY: isOpen ? 1 : 0.95
            }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="origin-top"
          >
            <p className="font-serif italic text-sm md:text-base leading-snug break-words py-1">
              {item.text}
            </p>
          </motion.div>
        </div>

        <motion.div 
          layout 
          className="mt-2 pt-2 border-t border-black/5 flex items-center justify-between"
        >
          <div className="flex gap-1">
            {[1, 2, 3].map(i => (
              <motion.div 
                key={i} 
                animate={isOpen ? { y: [0, -1.5, 0] } : { y: 0 }}
                transition={{ repeat: Infinity, duration: 1.5, delay: i * 0.2 }}
                className="w-0.5 h-0.5 rounded-full bg-current opacity-10" 
              />
            ))}
          </div>
          <motion.div
            animate={{ 
              rotate: isOpen ? 90 : 0,
              scale: isOpen ? 1.1 : 1,
              color: isOpen ? "#00BFA5" : "inherit"
            }}
          >
            <Sparkles size={10} className="opacity-30" />
          </motion.div>
        </motion.div>
      </div>

      {/* Peel Shadow Overlay (Top to Bottom) */}
      <motion.div 
        initial={false}
        animate={{ opacity: isOpen ? 0 : 0.1 }}
        className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-transparent pointer-events-none"
      />
    </motion.div>
  );
}
