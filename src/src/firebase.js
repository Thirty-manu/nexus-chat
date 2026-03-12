import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyADk56d4MYkRR8vsGetTjAUFNOO1dHoPwQ",
  authDomain: "nexus-chat-d6b6d.firebaseapp.com",
  projectId: "nexus-chat-d6b6d",
  storageBucket: "nexus-chat-d6b6d.firebasestorage.app",
  messagingSenderId: "68944715209",
  appId: "1:68944715209:web:e0fe28743a6a37ab08dc18"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();