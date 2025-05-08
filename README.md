<<<<<<< Updated upstream
<h1 align="center">🔱 Aigis 🔱</h1>



![Aigis__1_-removebg-preview](https://github.com/user-attachments/assets/b0cd6a8a-d9ee-4752-949b-59c8058e4c2a)

=======

###  Web Extension Protecting children and families from online dangers using AI-powered detection and supervision tools

![490021096_915984677401212_1827260408521174964_n](https://github.com/user-attachments/assets/5a7203a7-50ec-4e7e-ac07-03d9828b8e5e)


### 🌐 Live Demo & Resources

- 🚀 [Live Website](https://safewebguardian.tech) *(Replace with actual link)*
- 📝 [Devpost Project](https://devpost.com/software/safeweb-guardian) *(Replace with actual link)*
- 🎥 [Demo Video](https://youtu.be/safeweb-demo) *(Replace with actual link)*

---

## ⚠️ The Digital Dangers Facing Children

Children are increasingly exposed to online threats:

- 👤 **66%** of kids chat daily with strangers online — risking deepfakes and grooming.
- 💬 **12%** of parents report adults trying to befriend their children online.
- 🎮 **54%** of kids encounter violent content — some at risk of photosensitive epilepsy.
- 📹 Deepfakes make fake audio/video harder to detect during cam interactions.
- 🎮 **Most online games** are not approved by safety regulations, unlike AAA games.
- 📱 Kids aged 8–12 spend **5.4 hrs/day**, teens **8.2 hrs/day** online — often unsupervised.


> **Aigis** is our AI-powered browser extension and dashboard to detect threats and protect families in real time.

---

## 🧠 Key Features

- 🔍 **AI-Powered Chat Supervision**: Detects predator-like behavior in messages
- 🧑‍🚀 **Fake Profile Detection**: Deepfake analysis and behavior pattern scanning
- ⚔️ **Violent Game Flagging**: Analyses visuals and content tags for violence/epileptic risks
- 🗣️ **Voice/Video Analysis**: Detects fake audio, dangerous or inappropriate language in cam discussions
- 🛡️ **Parental Dashboard**: Centralized hub for reviewing alerts, reports, and safety stats

---

## 🛠️ Technical Stack

### 🧩 Extension (Frontend)
- **Browser**: JavaScript + HTML + Tailwind CSS
  - Chrome extension popup UI
  - Secure authentication flow
- **Dashboard**: React + Shadcn UI + Framer Motion
  - Intuitive UI for parent review
  - Real-time threat reports

### ⚙️ Backend
- **Core**: Node.js + Express + MongoDB
  - API routes for log storage and alert dispatch
  - Session & parental settings management

- **AI Models & Detection**
  - OpenAI Whisper & Gemini for audio/chat analysis
  - DeepFace/Deepware + MediaPipe for face detection and spoofing
  - Custom-trained NLP for threat intent detection
  - Flash and violence detection via OpenCV + metadata parsing

- **Infrastructure**
  - Hosted on Render / Vercel / Railway (TBD)
  - Scalable microservices architecture (future-ready)

---

![Architecture](/client/public/architecture.png)

---

## 🤝 Built by
- 👤 **Samar Souissi** – [LinkedIn](https://www.linkedin.com/in/samar-souissi-321b90308/)
- 👤 **Med Aziz Maatoug** – [LinkedIn](https://www.linkedin.com/in/aziz-maatoug)
- 👤 **Linda Sakouhi** – [LinkedIn](https://www.linkedin.com/in/linda-sakouhi-1059b6333/)
- 👤 **Fedi Abassi** – [LinkedIn](https://www.linkedin.com/in/fedi-abassi/)
- 👤 **Med Anas Obba** – [LinkedIn](https://www.linkedin.com/in/med-anas-obba-3716b732a/)
- 👤 **Taher Ayadi** – [LinkedIn](https://www.linkedin.com/in/taher-ayadi-424232254/)

>  Built with ❤️ as part of our university AI CBL Project to bring safety, ethics, and AI together.

---

## 🚀 Getting Started

### 1. Clone the Repository
```bash
git clone https://github.com/SynapsysESPRIT/AIGIS.git
cd AIGIS
```

### 2. Set Up the Backend (Django)
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

**Important:** After activating your environment, set your Hugging Face token:
```bash
export HUGGINGFACE_TOKEN=your_token_here  # On Windows: set HUGGINGFACE_TOKEN=your_token_here
export GROQAPI_KEY=your_key_here  # On Windows: set GROQAPI_KEY=your_key_here
```

### 3. Run the Backend Server
```bash
cd Backend
python manage.py migrate
python manage.py runserver
```

### 4. Set Up the Extension (Frontend)
- Open Chrome and go to `chrome://extensions/`
- Enable "Developer mode"
- Click "Load unpacked" and select the `extension` folder



---

- The backend will be available at `http://127.0.0.1:8000/`
- The extension popup will be available in your browser toolbar after loading.
- Make sure the backend is running before using the extension for detection features.

---

## 📝 License

SynapsysAI Children’s Online Protection License (SCOPL) - v1.0
Copyright (c) 2025 SynapsysAI™

Permission is hereby granted to use, copy, and modify this software for non-commercial and educational purposes only, subject to the following conditions:

This software is intended for the protection of children online and may not be used for surveillance, exploitation, or any unethical purposes.

All copies or substantial portions of the software must include this notice.

Commercial use, resale, or redistribution without prior written permission from Synapsys is strictly prohibited.

The name "SynapsysAI" and associated branding may not be used without explicit written permission.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND. UNDER NO CIRCUMSTANCES SHALL SYNAPSYS OR ITS CONTRIBUTORS BE LIABLE FOR ANY DAMAGE RESULTING FROM THE USE OR MISUSE OF THIS SOFTWARE.

![ezgif-127d46ce31ce9a](https://github.com/user-attachments/assets/d9ea5a71-6023-4e5d-97f3-f1916aac3c0c)




