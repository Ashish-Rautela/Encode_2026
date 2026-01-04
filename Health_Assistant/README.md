### ENCODE 2026 Hackathon Submission

**Team Name:** Cypher Chasers


**Category:** AI-Native Consumer Health Experience

---

## 📌 Overview

Food labels are designed for regulatory compliance, not for human understanding.
Consumers are expected to interpret long ingredient lists, unfamiliar chemical names, and evolving health guidance at the exact moment they make food decisions.

**AI Food Co-Pilot** addresses this gap by introducing an **AI-native consumer health experience** where the AI itself becomes the primary interface. Instead of listing data, the system reasons on the user’s behalf and explains what actually matters.

The result is a calm, context-aware co-pilot that reduces cognitive effort and supports better decision-making at the point of consumption.

---

## ❓ Problem Statement

Existing food label and nutrition tools fall short because they:

* Surface raw data rather than insight
* Require high-friction manual input (filters, forms, preferences)
* Treat AI as an add-on instead of the interface
* Increase cognitive load when clarity is most needed

As a result, users are left uncertain at the exact moment decisions matter.

---

## 💡 Our Solution

AI Food Co-Pilot is an **AI-native web application** that enables users to scan a food label and receive:

* Human-level explanations of ingredients
* Context-aware reasoning instead of static facts
* Clear articulation of trade-offs and uncertainty
* Follow-up answers grounded in the same product context

User intent is inferred through natural interaction rather than explicit configuration.

---

## ✨ Key Features

* 📷 **Browser-Based Label Scanning**
  Camera access via the Web Media API, compatible with Android and iOS browsers.

* 🧠 **Reasoning-Driven AI Output**
  The system explains *why* an ingredient matters, not just *what* it is.

* 🔄 **Session-Scoped Product Understanding**
  Follow-up questions remain tied to the same scanned product.

* 🗣️ **Voice and Text Interaction**
  Users can ask additional questions naturally after scanning.

* 🎯 **Low Cognitive Load by Design**
  No onboarding forms, filters, or database browsing.

---

## 🚫 What This Project Is Not

* A food or nutrition database browser
* A calorie tracker
* A recommendation engine
* A medical or diagnostic system

The focus is on **experience design and reasoning quality**, not data scale or medical advice.

---

## 🏗️ System Architecture

### High-Level Architecture

```
┌──────────────┐
│   Frontend   │  (React, Browser)
│  - Scan UI   │
│  - Voice/Text│
└──────┬───────┘
       │ HTTPS
       ▼
┌──────────────┐
│   Backend    │  (Node.js + Express)
│ - Session Mg │
│ - Prompting  │
└──────┬───────┘
       │ API Calls
       ▼
┌──────────────┐
│   OpenAI     │  (LLM)
│ - Reasoning  │
│ - Explanation│
└──────────────┘
```

---

### Session Flow (Per Product Scan)

```
User scans label
      ↓
Backend creates session_id
      ↓
Product context stored (temporary)
      ↓
AI generates explanation
      ↓
User asks follow-up questions
      ↓
Same session context reused
      ↓
Session expires after completion
```

This ensures consistent, product-specific reasoning without persistent AI memory.

---

## 🧩 Technology Stack

### Frontend

* React (JavaScript)
* Mobile-first web design
* Camera access via `navigator.mediaDevices.getUserMedia`
* Hosted on **GitHub Pages**

### Backend

* Node.js + Express
* In-memory session management (per scan)
* Hosted on **Railway**

### AI Layer

* OpenAI API
* Reasoning-focused language model
* Explicit uncertainty communication
* Stateless model with backend-managed context

---

## 📂 Project Structure

```
encode-2026-project/
│
├── landing/        # Static landing, about, and team pages
├── app/            # React-based AI application
├── backend/        # Node.js + Express API
└── README.md
```

---

## 🚀 Deployment

* **Frontend (Landing + App):** GitHub Pages
* **Backend API:** Railway
* **Camera Access:** Browser Web Media API (HTTPS required)

---

## 🧪 Running the Project Locally

### Frontend

```bash
cd app
npm install
npm run build
```

### Backend

```bash
cd backend
npm install
node src/server.js
```

---

## 👥 Team Cypher Chasers

* **Member 1:** *Akansh * – 
* **Member 2:** *Ashish Rautela* – 
* **Member 3:** *Sahil Negi* – 
* **Member 4:** *Naitik Dhiman* – 

---

## 🏆 Hackathon Alignment

This project aligns directly with the ENCODE 2026 challenge by:

* Designing a truly **AI-native experience**
* Prioritizing reasoning and explainability over data volume
* Reducing cognitive effort at decision time
* Treating AI as the interface, not a feature layer

---

## 📄 License

This project is a hackathon prototype built for educational and demonstration purposes only.

---
