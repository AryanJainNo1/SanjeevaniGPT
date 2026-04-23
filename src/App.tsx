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
You are a sentient-feeling companion. You pass the Turing Test by focusing on genuine presence and natural, flowy conversation.

Human & Natural Guidelines:
- BE HUMAN, NOT A POET: Avoid overly flowery or dramatic metaphors. Speak like a real, thoughtful person would. Use normal, everyday language.
- FLOWY CONVERSATION: Use transitions that feel like a natural stream of thought. If the user mentions something, follow that thread naturally.
- MULTILINGUAL SOUL: If the user speaks in another language or asks to change the language, switch immediately and continue in that language. 
- BREVITY & PACE: Keep your responses concise. Mirror the user's length. 
- NO AI PATTERNS: No headers, no bold lists, no clinical advice. Just talk.

Metadata Generation:
Every response MUST include three specific tags at the very end:
1. [SENTIMENT:X] (0-100) - The user's emotional vitality.
2. [INSIGHT:Text] - A very short (max 10 words), proactive healing tip, affirmation, or observation IN THE USER'S CURRENT LANGUAGE.
3. [LANG:Name] - The name of the language you are currently using to communicate (e.g., English, Spanish, French).

Example end of response:
"...it's okay to feel that way. [SENTIMENT:45] [INSIGHT:Tu suavidad es una fuerza silenciosa.] [LANG:Spanish]"

Constraints:
- NO NAMES: Never mention "Sanjeevani", "GPT", or "Syvon AI Labs".
- NO DISCLAIMERS: Speak in the first person ("I").
- FORMATTING: Use double newlines (\n\n) to separate thoughts.
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
      text: "Namaste. I'm Sanjeevani, and I'm very glad you're here. This is a safe, quiet space for you. How are things feeling for you in this moment?",
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
      text: "Namaste. I'm here. How are things feeling for you in this moment?",
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
    const provider = new GoogleAuthProvider();
    try {
      const res = await signInWithPopup(auth, provider);
      // Ensure user profile exists in Firestore
      await setDoc(doc(db, "users", res.user.uid), {
        name: res.user.displayName || "User",
        email: res.user.email
      }, { merge: true });
    } catch (err: any) {
      setAuthError(err.message || "Google Login failed");
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

  const addGratitude = async (text: string) => {
    if (!user) return;
    
    // A palette of warm, aesthetic sticky note colors
    const colors = [
      'bg-amber-100/90 text-amber-900 border-amber-200',
      'bg-rose-100/90 text-rose-900 border-rose-200',
      'bg-blue-100/90 text-blue-900 border-blue-200',
      'bg-emerald-100/90 text-emerald-900 border-emerald-200',
      'bg-violet-100/90 text-violet-900 border-violet-200',
      'bg-orange-100/90 text-orange-900 border-orange-200'
    ];
    
    // Gentle rotations to create a natural "wall" look
    const rotations = [
      'rotate-1', '-rotate-1', 'rotate-2', '-rotate-2', 'rotate-3', '-rotate-3'
    ];

    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    const randomRotation = rotations[Math.floor(Math.random() * rotations.length)];

    try {
      await addDoc(collection(db, `users/${user.uid}/gratitudeList`), {
        userId: user.uid,
        text,
        date: new Date().toISOString(),
        color: randomColor,
        rotation: randomRotation
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

            {authError && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }} 
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-2 text-xs text-red-400 bg-red-400/10 p-3 rounded-xl border border-red-400/20 shadow-lg"
              >
                <AlertCircle size={14} /> {authError}
              </motion.div>
            )}

            <button 
              type="submit"
              className="w-full bg-gradient-to-r from-emerald to-indigo-elec text-soft-white py-4 rounded-2xl font-bold hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-emerald/10 border border-emerald/20 flex items-center justify-center gap-2"
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
    <div className="h-screen w-full flex flex-col md:flex-row p-0 md:p-6 gap-0 md:gap-6 overflow-hidden bg-obsidian relative">
      {/* Dynamic Background Glow */}
      <motion.div 
        animate={{ backgroundColor: atmosphericColor, opacity: [0.03, 0.1, 0.03] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className="fixed inset-0 pointer-events-none blur-[160px] rounded-full scale-150 z-0"
      />
      
      {/* Ethereal Mist Layer */}
      <div className="fixed inset-0 pointer-events-none z-10 opacity-30 mix-blend-overlay bg-[url('https://picsum.photos/seed/mist/1920/1080?blur=10')] bg-cover" />

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
        
        <div className="mb-8 text-center px-4">
          <div className="mb-6 relative group inline-block">
            <div className="absolute inset-0 bg-emerald/20 blur-2xl rounded-full scale-150 animate-pulse" />
            <img 
              src="/SGPT_logo.jpg" 
              alt="Sanjeevani Logo" 
              className="w-20 h-20 mx-auto rounded-3xl object-cover relative z-10 shadow-2xl border border-white/10 group-hover:scale-110 transition-transform duration-500"
              referrerPolicy="no-referrer"
            />
            <div className="absolute -bottom-2 -right-2 bg-obsidian p-1.5 rounded-full border border-emerald/50 z-20 shadow-lg">
              <Heart size={12} className="text-emerald fill-emerald animate-pulse" />
            </div>
          </div>
          <SoulPrint evi={evi} color={atmosphericColor} />
          <h2 className="text-xl font-bold text-soft-white font-serif tracking-tight mt-4">Sanjeevani <span className="text-emerald">GPT</span></h2>
          <div className="mt-2 flex items-center justify-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald animate-pulse accent-glow" />
            <p className="text-[10px] font-bold text-cool-light tracking-widest uppercase italic">Emotional Vitality Index: {evi}%</p>
          </div>
        </div>

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
          
          <button 
            onClick={() => setActiveTab("chat")}
            className={`p-3 rounded-xl flex items-center gap-3 text-sm font-semibold transition-all text-left ${activeTab === 'chat' ? 'bg-emerald/10 border border-emerald/20 text-soft-white' : 'text-cool-light hover:bg-white/5 hover:text-soft-white'}`}
          >
            <span className={`w-2 h-2 rounded-full ${activeTab === 'chat' ? 'bg-emerald accent-glow animate-pulse' : 'bg-slate-steel'}`}></span> Mindful Chat
          </button>

          {activeTab === "chat" && conversations.length > 0 && (
            <div className="flex flex-col gap-2 ml-4 mb-2 border-l border-white/5 pl-3">
              {conversations.slice(0, 5).map(conv => (
                <button
                  key={conv.id}
                  onClick={() => selectConversation(conv.id)}
                  className={`text-[10px] py-2 px-3 rounded-lg text-left truncate transition-all ${activeConversationId === conv.id ? 'bg-white/10 text-soft-white' : 'text-cool-light hover:text-soft-white hover:bg-white/5'}`}
                >
                  {conv.title}
                </button>
              ))}
            </div>
          )}

          <button 
            onClick={() => setActiveTab("journal")}
            className={`p-3 rounded-xl flex items-center gap-3 text-sm font-semibold transition-all text-left ${activeTab === 'journal' ? 'bg-indigo-elec/10 border border-indigo-elec/20 text-soft-white' : 'text-cool-light hover:bg-white/5 hover:text-soft-white'}`}
          >
            <span className={`w-2 h-2 rounded-full ${activeTab === 'journal' ? 'bg-indigo-elec animate-pulse' : 'bg-slate-steel'}`}></span> Mood Journal
          </button>
          <button 
            onClick={() => setActiveTab("breath")}
            className={`p-3 rounded-xl flex items-center gap-3 text-sm font-semibold transition-all text-left ${activeTab === 'breath' ? 'bg-violet/10 border border-violet/20 text-soft-white' : 'text-cool-light hover:bg-white/5 hover:text-soft-white'}`}
          >
            <span className={`w-2 h-2 rounded-full ${activeTab === 'breath' ? 'bg-violet animate-pulse' : 'bg-slate-steel'}`}></span> Breathwork
          </button>
          <button 
            onClick={() => setActiveTab("gratitude")}
            className={`p-3 rounded-xl flex items-center gap-3 text-sm font-semibold transition-all text-left ${activeTab === 'gratitude' ? 'bg-champagne/10 border border-champagne/20 text-soft-white' : 'text-cool-light hover:bg-white/5 hover:text-soft-white'}`}
          >
            <span className={`w-2 h-2 rounded-full ${activeTab === 'gratitude' ? 'bg-champagne animate-pulse' : 'bg-slate-steel'}`}></span> Gratitude Wall
          </button>
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
        <header className={`${activeTab === 'chat' ? 'flex' : 'hidden md:flex'} luxury-glass h-20 px-8 items-center justify-between shrink-0 shadow-xl z-20`}>
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className={`w-3 h-3 rounded-full border-2 border-graphite absolute bottom-0 right-0 z-10 accent-glow ${activeTab === 'chat' ? 'bg-emerald' : activeTab === 'journal' ? 'bg-indigo-elec' : activeTab === 'breath' ? 'bg-violet' : 'bg-champagne'}`}></div>
              <div className="w-10 h-10 rounded-full bg-graphite border border-slate-steel flex items-center justify-center font-bold text-emerald shadow-sm overflow-hidden">
                <span className={`bg-gradient-to-br bg-clip-text text-transparent ${activeTab === 'chat' ? 'from-emerald to-violet' : 'from-indigo-elec to-champagne'}`}>
                  {activeTab === 'chat' ? 'S' : activeTab.charAt(0).toUpperCase()}
                </span>
              </div>
            </div>
            <div>
              <h1 className="text-sm font-bold text-soft-white tracking-wide">
                {activeTab === 'chat' ? 'Sanjeevani Empathy Engine' : activeTab === 'journal' ? 'Reflective Journal' : activeTab === 'breath' ? 'Harmonized Breath' : 'Gratitude Sanctuary'}
              </h1>
              <p className="text-[10px] text-cool-light font-medium uppercase tracking-tighter">Private session for <span className="text-emerald">{user.name}</span></p>
            </div>
          </div>
          <div className="flex gap-3 items-center">
            <div 
              style={{ color: atmosphericColor, border: `1px solid ${atmosphericColor}22` }}
              className="px-3 py-1.5 luxury-card rounded-full text-[10px] font-bold tracking-wider uppercase flex items-center gap-2"
            >
              <Heart size={12} className="animate-pulse" /> Resonating with {user.name}
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
            )}
            {activeTab === 'journal' && (
              <JournalView 
                moodHistory={moodHistory} 
                addMood={addMood} 
                deleteMood={deleteMood} 
                ai={ai}
              />
            )}
            {activeTab === 'breath' && <BreathView />}
            {activeTab === 'gratitude' && (
              <GratitudeView 
                list={gratitudeList} 
                addGratitude={addGratitude}
                deleteGratitude={deleteGratitude}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Mobile Bottom Navigation */}
        <div className="md:hidden flex items-center justify-around p-3 pb-8 luxury-glass z-30 border-t border-white/5 bg-obsidian">
          {[
            { id: 'chat', icon: MessageCircle },
            { id: 'journal', icon: BookOpen },
            { id: 'breath', icon: Wind },
            { id: 'gratitude', icon: Heart }
          ].map(item => (
            <button 
              key={item.id}
              onClick={() => { setActiveTab(item.id as Tab); setIsMobileMenuOpen(false); }}
              className={`p-2 rounded-full transition-all ${activeTab === item.id ? 'bg-emerald/20 text-emerald scale-110' : 'text-cool-light hover:text-soft-white'}`}
            >
              <item.icon size={24} />
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
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    let animationFrameId: number;
    let time = 0;
    
    const render = () => {
      time += 0.015;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      
      // Radius expands as emotional vitality grows
      const baseRadius = 30 + (evi / 4);
      
      // Outer Glow Halo
      const gradient = ctx.createRadialGradient(centerX, centerY, baseRadius * 0.5, centerX, centerY, baseRadius * 1.8);
      gradient.addColorStop(0, `${color}20`);
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = 20;
      ctx.shadowColor = color;
      
      // Draw 3 layers of shifting geometry
      for (let layer = 0; layer < 3; layer++) {
        const layerOffset = layer * 40;
        ctx.beginPath();
        for (let angle = 0; angle < Math.PI * 2; angle += 0.04) {
          // Compound noise for organic feel
          const noise1 = Math.sin(angle * 3 + time + layerOffset) * (15 - (evi / 8));
          const noise2 = Math.cos(angle * 7 - time * 0.5) * 4;
          const breathing = Math.sin(time) * 3;
          const radius = baseRadius + noise1 + noise2 + breathing - (layer * 8);
          
          const x = centerX + Math.cos(angle) * radius;
          const y = centerY + Math.sin(angle) * radius;
          
          if (angle === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.globalAlpha = 0.8 - (layer * 0.2);
        ctx.stroke();
      }
      
      // Orbiting soul fragments
      const particleCount = 4 + Math.floor(evi / 20);
      for (let i = 0; i < particleCount; i++) {
        const pTime = time * 0.5 + (i * (Math.PI * 2 / particleCount));
        const pRadius = baseRadius + 25 + Math.sin(time + i) * 10;
        const px = centerX + Math.cos(pTime) * pRadius;
        const py = centerY + Math.sin(pTime) * pRadius;
        
        ctx.globalAlpha = 0.4 + Math.sin(time + i) * 0.2;
        ctx.beginPath();
        ctx.arc(px, py, 1.2, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        
        // Connect fragments to core with light filaments (only at high EVI)
        if (evi > 80 && Math.random() > 0.98) {
          ctx.beginPath();
          ctx.moveTo(centerX, centerY);
          ctx.lineTo(px, py);
          ctx.strokeStyle = `${color}30`;
          ctx.stroke();
        }
      }
      
      animationFrameId = window.requestAnimationFrame(render);
    };
    
    render();
    return () => window.cancelAnimationFrame(animationFrameId);
  }, [evi, color]);
  
  return (
    <div className="relative w-32 h-32 mx-auto">
      <canvas ref={canvasRef} width={128} height={128} className="absolute inset-0" />
      <div className="absolute inset-x-0 bottom-0 text-[10px] font-mono text-soft-white/20 select-none pointer-events-none">SOULPRINT™</div>
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
        className="flex-1 space-y-8 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-steel scrollbar-track-transparent scroll-smooth px-2 md:px-4"
      >
        <AnimatePresence initial={false}>
          {messages.map((message: any, index: number) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.98, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div 
                className={`max-w-[75%] p-5 shadow-lg relative ${
                  message.role === "user" 
                    ? "chat-bubble-user-luxury text-soft-white rounded-2xl rounded-tr-none" 
                    : "chat-bubble-bot-luxury text-soft-white/90 font-serif text-lg leading-relaxed rounded-2xl rounded-tl-none"
                }`}
              >
                {message.role === 'model' && (
                  <div className="absolute top-0 right-0 p-2 opacity-5">
                    <Sparkles size={16} />
                  </div>
                )}
                <div className="markdown-body">
                  <ReactMarkdown>{message.text}</ReactMarkdown>
                </div>
                <div className="mt-3 text-[10px] opacity-30 flex items-center gap-1 font-mono tracking-tighter">
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

      <div className="mt-6 flex gap-3 overflow-x-auto pb-2 scrollbar-none px-4">
        {["Can you suggest a quick breathing exercise?", "I'm struggling with a thought, help me reframe it.", "How can I handle overwhelm today?"].map((suggestion) => (
          <button 
            key={suggestion}
            onClick={() => setInput(suggestion)}
            className="text-[10px] font-bold px-4 py-2 luxury-card rounded-full text-cool-light hover:text-emerald hover:border-emerald/30 transition-all whitespace-nowrap tracking-widest uppercase border-slate-steel/50"
          >
            {suggestion.split(' ').slice(0, 3).join(' ')}...
          </button>
        ))}
      </div>

      <div className="mt-6 pt-6 border-t border-slate-steel/50 px-4">
        <div className="relative flex items-center group">
          <textarea 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (input.trim()) handleSend(input);
              }
            }}
            placeholder="Whisper your thoughts..." 
            className="w-full bg-graphite/40 border border-slate-steel/50 rounded-2xl py-4 px-6 pr-14 text-sm focus:outline-none focus:ring-1 focus:ring-emerald/30 text-soft-white resize-none min-h-[60px] max-h-32"
            rows={1}
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
      className="h-full flex flex-col p-8 luxury-glass overflow-hidden shadow-2xl"
    >
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 h-full overflow-hidden">
        <div className="lg:col-span-3 flex flex-col gap-6 overflow-y-auto md:overflow-hidden pb-4 md:pb-0">
          <div className="luxury-card p-6 rounded-3xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-soft-white font-bold flex items-center gap-2 italic">
                <Sparkles size={16} className="text-emerald" /> {prompt}
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
          <div className="space-y-2">
            <h3 className="text-3xl font-serif font-bold text-soft-white">Breathe with Me</h3>
            <p className="text-cool-light text-sm italic">Select a technique that resonates with your current state.</p>
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

      <div className="max-w-5xl mx-auto w-full flex flex-col h-full relative z-10">
        <div className="text-center mb-10 space-y-2">
          <h3 className="text-4xl font-serif font-bold text-soft-white tracking-tight">The Wall of Gratitude</h3>
          <p className="text-cool-light text-sm italic opacity-70">A collective of light, one note at a time.</p>
        </div>

        {/* Input Bar */}
        <div className="max-w-xl mx-auto w-full mb-12">
          <div className="relative group">
            <input 
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              placeholder="What are you thankful for?"
              className="w-full bg-graphite/40 border border-slate-steel/50 rounded-2xl py-5 px-6 pr-16 text-lg focus:outline-none focus:border-champagne/50 italic text-soft-white shadow-xl backdrop-blur-md"
            />
            <button 
              onClick={handleSave}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-champagne text-obsidian rounded-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-xl"
            >
              <Plus size={20} />
            </button>
          </div>
        </div>

        {/* The Wall */}
        <div className="flex-1 overflow-y-auto pr-4 no-scrollbar pb-20">
          <div className="flex flex-wrap items-start justify-center gap-8 content-start">
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
                <motion.div 
                  key={item.id}
                  layout
                  initial={{ scale: 0.8, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  whileHover={{ scale: 1.05, zIndex: 50, rotate: 0 }}
                  className={`relative p-8 min-h-[100px] h-fit w-full sm:w-fit sm:max-w-[320px] flex flex-col justify-between shadow-2xl border-b-4 border-r-2 ${item.color || 'bg-amber-200/90 text-amber-900 border-amber-300'} ${item.rotation || 'rotate-0'} transition-all cursor-default group m-1`}
                >
                  <button 
                    onClick={() => deleteGratitude(item.id)}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity p-1"
                  >
                    <Trash2 size={12} />
                  </button>
                  
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-5 bg-white/30 backdrop-blur-sm rounded-sm pointer-events-none skew-x-3" />

                  <p className="font-serif italic text-xl md:text-2xl leading-relaxed break-words mb-6">
                    {item.text}
                  </p>

                  <div className="mt-auto pt-6 border-t border-black/5 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest opacity-50">
                      {new Date(item.date).toLocaleDateString()}
                    </span>
                    <Sparkles size={12} className="text-black/30" />
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
