/**
 * ARQUIVO DE CONFIGURAÇÃO DE NUVEM
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAWeAC5nsodUBtFTz3FzJOz3ToXEiOzgCk",
  authDomain: "study-tracker-b0975.firebaseapp.com",
  projectId: "study-tracker-b0975",
  storageBucket: "study-tracker-b0975.firebasestorage.app",
  messagingSenderId: "178137471898",
  appId: "1:178137471898:web:1e8e803f9e64f205a5b823"
};

let app, auth, db;
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
} catch (error) {
    console.error("Erro na inicialização do Firebase:", error);
}

export { auth, db };