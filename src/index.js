import dns from "dns";
dns.setServers(["8.8.8.8", "1.1.1.1"]);

import dotenv from "dotenv";
dotenv.config({
  path: "./.env",
});
import { app } from "./app.js";
import connectDB from "./db/index.js";

const PORT = process.env.PORT || 8000;

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server is listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.log("MongoDB connection error ❌", err);
  });
