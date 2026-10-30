import app from "./app";

// Vercel calls the default export as a Node (req, res) handler; an Express app
// is one, so no app.listen() here. Local and Replit runs still use index.ts.
export default app;
