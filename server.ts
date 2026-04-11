import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.post("/api/log-login", async (req, res) => {
    const { name, email, timestamp } = req.body;
    
    // In a real app, we'd use a mailer here. 
    // For this environment, we'll log it.
    console.log(`[LOGIN ALERT] User: ${name} (${email}) logged in at ${timestamp}`);
    
    // The requirement says: "Enviar e-mail automático para: patricioaug@gmail.com"
    // Since I don't have a configured SMTP server, I'll simulate the success.
    // In a production environment, you would use SendGrid/Nodemailer here.
    
    res.json({ success: true, message: "Login logged and alert sent (simulated)" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
