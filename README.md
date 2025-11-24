DS Dashboard – Graduation Project (Pharos University)

This repository contains the Frontend (Next.js) for our Graduation Project at Pharos University – Computer Science Department.

📌 Project Structure
IDS_APP/
│── app/          → Frontend (Next.js UI)
│── backend/      → Backend team workspace (Node.js)
│── public/
│── package.json

🚀 Frontend Setup
npm install
npm run dev


Runs on:

http://localhost:3000

🧩 Backend (Node.js Team)

Work inside:

/backend


Backend should create these endpoints to match the frontend:

POST /predict

POST /upload-dataset

GET /monitor/start

GET /monitor/stop

👥 Team Workflow

Frontend members work inside /app

Backend members work inside /backend

Each member uses their own branch → push → pull request → merge into main