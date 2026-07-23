// Entry serverless Vercel — meng-ekspor app Express dari api-server.js.
// Semua request /api/* diarahkan ke sini lewat rewrite di vercel.json,
// dan app Express mencocokkan path aslinya (mis. /api/login).
import app from "../api-server.js";

export default app;
