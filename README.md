# 🚀 FinTrust - The Trust-Based Loan Tracker

FinTrust is a high-performance P2P (Peer-to-Peer) personal lending platform designed to simplify tracking informal loans between friends, family, and associates. By combining transparent tracking with a robust trust-scoring system, FinTrust helps maintain financial integrity and social harmony.

---

## ✨ Core Features

- **📊 Comprehensive Loan Management**: Effortlessly track Lent and Borrowed money in one unified dashboard.
- **🛡️ Secure Trust Score (0-100)**: A data-driven score calculated based on identity verification, borrowing history, and lending engagement.
- **⚡ Real-Time Notifications**: Instant updates when a loan is requested, approved, or when a payment is received.
- **🤖 FinBot AI Assistant**: Integrated Gemini-powered AI to help users understand lending etiquette and calculate interest.
- **🎮 Gamification & Leaderboards**: Earn points and badges for on-time payments and healthy lending habits.
- **🌐 Social Hub**: Find and connect with trusted peers through a verified search system.
- **📱 PWA Ready**: Installable as a mobile app for on-the-go tracking.

---

## 🛠️ Technical Stack

- **Frontend**: React 19 + Vite + Framer Motion (for premium animations).
- **Backend/DB**: Supabase (PostgreSQL with real-time listeners).
- **Security**: Row-Level Security (RLS) policies hardened for multi-tenant data privacy.
- **AI**: Google Gemini Pro 1.5.
- **PWA**: Vite PWA plugin for offline capabilities.
- **Styling**: Vanilla CSS with a custom designed theme (Glassmorphism & Neon accents).

---

## 📜 Deployment Setup

### 1. Environment Variables
Create a `.env` file in the root directory:
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_GEMINI_API_KEY=your_gemini_api_key
```

### 2. Database Schema
Apply the following SQL migrations in your Supabase SQL Editor:
- `supabase_schema.sql` (Core tables)
- `trust_score_schema.sql` (Trust score logic)
- `fix_rls.sql` (Security hardening)

### 3. Build & Deploy
```bash
npm install
npm run build
```
The project is configured for **Vercel** with a optimized `vercel.json` for SPA routing and security.

---

## 🚦 Performance & Load Testing
We implemented a custom real-user simulation script to ensure the platform handles concurrent usage smoothly.
- **Command**: `node --env-file=.env scripts/load_test.js`
- **Result**: Successfully handles 50+ concurrent users with sub-2s average latency on edge endpoints.

---

## 🤝 Contributing
FinTrust was built with the goal of fostering financial transparency. Feel free to fork and enhance!

---
*Created for the Mini-Project FinTrust*
