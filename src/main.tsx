
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Diagnostic log to check environment variable
console.log("ENV VAR:", import.meta.env.VITE_ENABLE_LOGS);

createRoot(document.getElementById("root")!).render(<App />);
