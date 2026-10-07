# Aptlyra Frontend 💻

The user-facing application for Aptlyra. A high-performance, responsive React application built with Vite and TypeScript, providing an immersive interview experience.

## ✨ Features

- **🎤 Interactive Interview Terminal**: Real-time status updates (Transcribing -> Evaluating -> Feedback Ready) via WebSockets, integrated **Monaco Code Editor**, and **Excalidraw Whiteboard**.
- **⏲️ Active Session Timer & Persistence**: Real-time display of interview duration. Leveraging **IndexedDB** to store audio blobs and code drafts locally, ensuring no progress is lost if the browser is closed mid-session.
- **📈 Advanced Analytics & Visualization**: Executive-level analysis dashboard using Chart.js. View Tech vs. Confidence scores over time, speech patterns (WPM, Filler words), and role-specific mastery calibration.
- **🎮 Built-in Gamification**: Level up by completing sessions! Features XP tracking, daily streaks, dynamic titles, and unlockable achievement badges.
- **📊 Dynamic Dashboard**: View interview history, resume analysis history, and stats with professional **Skeleton Shimmer** loading states.
- **📄 ATS Resume Analyzer (Bonus)**: Upload and visualize structured parsed data with editable JSON-like forms, and maintain a history of your past uploads.
- **📝 PDF Generation**: Generate beautiful, ATS-optimized Resumes and tailored Cover Letters directly in the browser via `@react-pdf/renderer`.
- **🎯 Resume-Driven Interviews**: Initiate new interviews using context from your previously uploaded and parsed resumes to generate project-specific questions.

## 🏗️ Tech Stack

- **React 19 & TypeScript**: Robust, type-safe Component UI.
- **Vite**: Ultra-fast build tool and dev server.
- **Redux Toolkit**: Centralized state management for interview sessions.
- **React Router DOM v7**: Modern routing and navigation.
- **Framer Motion**: Smooth micro-animations and layout transitions.
- **IndexedDB**: Persistent client-side storage for binary audio data.
- **Chart.js**: Graphical mastery calibration and performance metrics.
- **React-PDF**: Client-side PDF generation for resumes and cover letters.
- **Monaco Editor**: Powerful in-browser code editor.
- **Excalidraw**: Integrated whiteboard for system design questions.
- **Tailwind CSS v4**: Utility-first CSS for the modern Neo-Dark design system.
- **Socket.io-client**: Real-time event synchronization.
- **Vitest & React Testing Library**: Component testing and test runners.

## 🛠️ Installation & Setup

### 1. Prerequisites
- **Node.js 18+**
- **npm** or **yarn**

### 2. Environment Setup
```bash
# Navigate to the frontend directory
cd frontend

# Install dependencies
npm install
```

### 3. Configuration
Create a `.env` file in this directory:
```env
VITE_API_URL=http://localhost:5000/api
VITE_GOOGLE_CLIENT_ID=your_google_client_id_here
```

## 🏃 Running Locally

```bash
# Start the development server
npm run dev
```
The app will be available at `http://localhost:5173`.

## 📂 Core Modules Breakdown

- `src/pages/`: Main view components (Dashboard, Interview, Review, Resume Analyzer).
- `src/components/`: Reusable UI elements, loaders, and card systems.
- `src/features/`: Feature-sliced logic for the Session Runner, Auth, and Resume Parsing.
- `src/hooks/`: Custom hooks for Audio Recording, WebSocket synchronization, and API polling.
- `src/utils/`: IndexedDB handlers and formatting utilities.

---

