# 🛠️ FinTrust Technical Stack

This document outlines the complete technology stack used in the development of the **FinTrust** personal lending and creditworthiness platform.

---

### ⚛️ Frontend Core
*   **React 19.x**: Modern foundation for the user interface, utilizing the latest React features for high performance and better state management.
*   **Vite 7.x**: Lightning-fast build tool and development server, replacing older tools like CRA for a better developer experience.
*   **React Router DOM 7.x**: Manage routing and deep-linking, including protected dashboard routes and public landing pages.
*   **JavaScript (ESM)**: Developed using modern ECMAScript standards with full module support.

### ☁️ Backend & Database (Supabase)
*   **PostgreSQL**: High-performance relational database for storing sensitive financial records, loans, and profiles.
*   **Supabase Auth**: Secure authentication engine handling both traditional email/password and modern Google OAuth providers.
*   **Row-Level Security (RLS)**: Essential security layer ensuring users can only access their own loan and identity data.
*   **Supabase Storage**: Backend for hosting user profile pictures and document proofing (Aadhaar/Identity).
*   **SQL Triggers & PL/pgSQL Functions**: Automates complex data operations like profile creation on signup and real-time activity logging.

### ✨ Styling & UI Excellence
*   **Vanilla CSS**: Custom design system focused on high-end aesthetics:
    *   **Glassmorphism**: Translucent, blurred backgrounds for modern cards.
    *   **Neon Accents**: Cyberpunk-inspired colors for "Trust Scores" and important alerts.
    *   **Vibrant Gradients**: Used for "Hero" sections and call-to-action buttons.
*   **Framer Motion 12.x**: Library for high-fidelity animations, entry reveals, and smooth component transitions.
*   **Lottie React**: Implements lightweight Lottie vector animations for interactive finance-themed visual cues.
*   **Google Fonts**: Professional typography using **Inter** and **Roboto** for readability and modern feel.

### 📊 Data, Analytics & Utilities
*   **Chart.js & React-Chartjs-2**: Generates interactive financial charts for loan distribution and repayment history.
*   **React Hot Toast**: Real-time feedback system for action confirmation and loan request notifications.
*   **React Intersection Observer**: Reveals content as the user scrolls, creating a dynamic single-page landing experience.
*   **Export-to-CSV**: Custom utility for professional data portability of loan records.

### 🔧 Development, Performance & AI
*   **ESLint 9.x**: Linter for identifying and fixing patterns in JavaScript and React code.
*   **Vite Plugin PWA**: Configuration for making the application installable on mobile and desktop as a Progressive Web App.
*   **Google Generative AI SDK**: Integrated for future AI-powered features like financial advising or risk assessment bots.

---
*Created on 2026-04-06*
