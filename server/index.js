import "dotenv/config";
import path from "node:path";
import fs from "node:fs";
import express from "express";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { query } from "./db.js";


// Express backend for the Family Travel Tracker.
// Responsible for rendering pages, storing travel data in PostgreSQL,
// handling login, and serving frontend assets.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = process.env.NODE_ENV !== "production";
const app = express();


// Serve static frontend files such as images and icons from the public folder.

// const staticDir = path.join(__dirname, "..", "client", "public");
// app.use("/static", express.static(staticDir));

// Set up EJS so the server can render dynamic pages such as the dashboard and maps.
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Allow Express to process form submissions and JSON requests from the frontend.
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Login credentials and path come from environment variables.
const LOGIN_PATH = process.env.LOGIN_PATH || "/hidden-login";
const LOGIN_USERNAME = process.env.LOGIN_USERNAME || "";
const LOGIN_PASSWORD = process.env.LOGIN_PASSWORD || "";

// Session token for authentication.
// Generate a random one if it is not provided in the environment.
const LOGIN_SESSION_TOKEN =
  process.env.LOGIN_SESSION_TOKEN || crypto.randomBytes(24).toString("hex");

// Helper function to read cookies from the request.
function parseCookies(cookieHeader = "") {
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const eqIndex = part.indexOf("=");
        if (eqIndex === -1) return [part, ""];
        const key = part.slice(0, eqIndex);
        const value = decodeURIComponent(part.slice(eqIndex + 1));
        return [key, value];
      })
  );
}

// Verify the user is logged in by checking the auth cookie.
function isLoggedIn(req) {
  const cookies = parseCookies(req.headers.cookie);
  return cookies.user_auth === LOGIN_SESSION_TOKEN;
}

// Check if the user is logged in before allowing access to a route.
function requireLogin(req, res, next) {
  if (!isLoggedIn(req)) {
    return res.redirect(LOGIN_PATH);
  }
  next();
}

// Configure Vite.
// Dev mode uses Vite middleware, production serves built files.
let vite;
let manifest;

if (isDev) {
  const { createServer } = await import("vite");
  vite = await createServer({
    configFile: path.join(process.cwd(), "vite.config.js"),
    server: { middlewareMode: true }
  });
  app.use(vite.middlewares);
} else {
  app.use(
    "/assets",
    express.static(path.join(process.cwd(), "dist", "assets"), { maxAge: "1y" })
  );
  manifest = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "dist", "manifest.json"), "utf-8")
  );
}

// Helper function to load the correct frontend assets in dev or production.
function assetTags() {
  if (isDev) {
    return `
      <script type="module" src="/@vite/client"></script>
      <script type="module" src="/client/main.js"></script>
    `;
  }

  const entry = manifest["client/main.js"];
  const js = entry?.file
    ? `<script type="module" src="/assets/${entry.file}"></script>`
    : "";

  const css = (entry?.css || [])
    .map((file) => `<link rel="stylesheet" href="/assets/${file}">`)
    .join("\n");

  return `${css}\n${js}`;
}

// Track which user is currently active in the app.
let currentUserId = 1;

// Fetch all users from the database.
async function getUsers() {
  return await query("SELECT * FROM users ORDER BY id ASC;");
}

// Return the active user from the user list.
// Default to the first user if needed.
async function getCurrentUser() {
  const users = await getUsers();
  return users.find((u) => u.id === Number(currentUserId)) || users[0];
}

// Fetch the list of countries the user has visited.
async function getVisitedForUser(uid) {
  return await query(
    `
    SELECT vc.id, c.country_name, c.country_code, vc.visited_on, vc.added_at
    FROM visited_countries vc
    JOIN countries c ON c.country_code = vc.country_code
    WHERE vc.user_id = $1
    ORDER BY vc.visited_on DESC NULLS LAST, c.country_name ASC;
    `,
    [uid]
  );
}

// Fetch the most recent countries visited by the user.
async function getRecent(uid, limit = 5) {
  return await query(
    `
    SELECT c.country_name, vc.visited_on, vc.added_at
    FROM visited_countries vc
    JOIN countries c ON c.country_code = vc.country_code
    WHERE vc.user_id = $1
    ORDER BY COALESCE(vc.visited_on, vc.added_at) DESC
    LIMIT $2;
    `,
    [uid, limit]
  );
}

// Get travel statistics for the current user.
async function getStats(uid) {
  const [{ count: totalCountries } = { count: 0 }] = await query(
    `SELECT COUNT(*)::int AS count FROM visited_countries WHERE user_id = $1;`,
    [uid]
  );

  // Placeholder value for continent tracking.
  const continents = 0;

  const mostRecentRow = (
    await query(
      `
      SELECT c.country_name, vc.visited_on
      FROM visited_countries vc
      JOIN countries c ON c.country_code = vc.country_code
      WHERE vc.user_id = $1 AND vc.visited_on IS NOT NULL
      ORDER BY vc.visited_on DESC
      LIMIT 1;
      `,
      [uid]
    )
  )[0];

  // Travel milestones to show progress and the next goal.
  const milestones = [10, 25, 50, 100];
  const nextMilestone =
    milestones.find((milestone) => totalCountries < milestone) || 100;

  const remainingToGoal = Math.max(nextMilestone - totalCountries, 0);
  const goalPercent = Math.round(
    Math.min((totalCountries / nextMilestone) * 100, 100)
  );

  return {
    totalCountries,
    continents,
    mostRecent: mostRecentRow
      ? {
          name: mostRecentRow.country_name,
          date: new Date(mostRecentRow.visited_on).toLocaleDateString()
        }
      : null,
    goal: {
      nextMilestone,
      remainingToGoal,
      percent: goalPercent
    }
  };
}

// Fetch visited countries across all users.
async function getCombinedVisits() {
  return await query(
    `
    SELECT
      vc.country_code,
      json_agg(
        json_build_object(
          'id', u.id,
          'name', u.name,
          'color', u.color
        )
        ORDER BY u.id
      ) AS visitors
    FROM visited_countries vc
    JOIN users u ON u.id = vc.user_id
    GROUP BY vc.country_code
    ORDER BY vc.country_code;
    `
  );
}

// Show the login page for the app.
app.get(LOGIN_PATH, (req, res) => {
  const hasLoginConfigured = LOGIN_USERNAME && LOGIN_PASSWORD;

  if (!hasLoginConfigured) {
    return res
      .status(500)
      .send(
        `<pre>Missing LOGIN_USERNAME or LOGIN_PASSWORD in your .env file.</pre>`
      );
  }

  if (isLoggedIn(req)) {
    return res.redirect("/");
  }

  res.render("login", {
    assets: assetTags(),
    error: null,
    formAction: LOGIN_PATH,
    pageTitle: "Login",
    subtitle: "Sign in"
  });
});

// Process login and set the auth cookie if credentials are correct.
app.post(LOGIN_PATH, (req, res) => {
  const { username, password } = req.body;

  if (!LOGIN_USERNAME || !LOGIN_PASSWORD) {
    return res
      .status(500)
      .send(
        `<pre>Missing LOGIN_USERNAME or LOGIN_PASSWORD in your .env file.</pre>`
      );
  }

  if (username === LOGIN_USERNAME && password === LOGIN_PASSWORD) {
    res.setHeader(
      "Set-Cookie",
      `user_auth=${encodeURIComponent(
        LOGIN_SESSION_TOKEN
      )}; HttpOnly; Path=/; SameSite=Lax`
    );
    return res.redirect("/");
  }

  res.status(401).render("login", {
    assets: assetTags(),
    error: "Incorrect username or password.",
    formAction: LOGIN_PATH,
    pageTitle: "Login",
    subtitle: "Sign in"
  });
});

// Clear the login cookie and send the user back to login.
app.post("/logout", (_req, res) => {
  res.setHeader(
    "Set-Cookie",
    "user_auth=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax"
  );
  res.redirect(LOGIN_PATH);
});

// Load the dashboard with the current user's travel data.
app.get("/", requireLogin, async (req, res, next) => {
  try {
    const users = await getUsers();
    if (!users.length) return res.redirect("/setup");

    const currentUser = await getCurrentUser();
    const countries = await getVisitedForUser(currentUser.id);
    const recent = await getRecent(currentUser.id);
    const stats = await getStats(currentUser.id);

    const visitedCodes = countries.map((c) => c.country_code).join(",");

    res.render("index", {
      title: "Dashboard",
      users,
      currentUser,
      accent: currentUser?.color || "#14b8a6",
      countries,
      recent,
      stats,
      visitedCodes,
      error: req.query.error || null,
      assets: assetTags()
    });
  } catch (err) {
    next(err);
  }
});

// Show the interactive world map for the active user.
app.get("/map", requireLogin, async (req, res, next) => {
  try {
    const users = await getUsers();
    if (!users.length) return res.redirect("/setup");

    const currentUser = await getCurrentUser();
    const countries = await getVisitedForUser(currentUser.id);
    const visitedCodes = countries.map((c) => c.country_code).join(",");

    res.render("map", {
      title: "World map · Family Travel Tracker",
      assets: assetTags(),
      currentUser,
      users,
      visitedCodes,
      combinedVisits: null
    });
  } catch (err) {
    next(err);
  }
});

// Coming soon: family map that will combine visits from all users.
app.get("/family-map", requireLogin, async (req, res, next) => {
  try {
    const users = await getUsers();
    if (!users.length) {
      return res.redirect("/setup");
    }

    const currentUser = await getCurrentUser();

    res.render("family-map", {
      title: "Family map · Coming Soon",
      assets: assetTags(),
      currentUser
    });
  } catch (err) {
    next(err);
  }
});

// Route shown when the database is not set up yet.
app.get("/setup", (_req, res) => {
  res.send(`<pre>Run your SQL in sql/schema.sql, then revisit /</pre>`);
});

// Handle adding a new visited country.
app.post("/add", requireLogin, async (req, res) => {
  const { country, visited_on } = req.body;
  const trimmedCountry = String(country || "").trim();

  try {
    if (!trimmedCountry) {
      throw new Error("Please enter a valid country.");
    }

    // Match the country name even if the user doesn't type it exactly.
    const row = (
      await query(
        `
        SELECT country_code
        FROM countries
        WHERE LOWER(country_name) LIKE '%' || $1 || '%'
        LIMIT 1;
        `,
        [trimmedCountry.toLowerCase()]
      )
    )[0];

    if (!row) {
      throw new Error("Country not found");
    }

    // Avoid inserting a duplicate visit if the user already added this country.
    await query(
      `
      INSERT INTO visited_countries (country_code, user_id, visited_on)
      VALUES ($1, $2, $3)
      ON CONFLICT DO NOTHING;
      `,
      [row.country_code, currentUserId, visited_on || null]
    );

    res.redirect("/");
  } catch (err) {
    const message =
      err.message === "Please enter a valid country."
        ? err.message
        : err.code === "23505"
          ? "You already visited that country."
          : err.message || "Something went wrong.";

    res.redirect("/?error=" + encodeURIComponent(message));
  }
});

// Coming soon: Switch between users so the app shows their travel history.
app.post("/user", requireLogin, async (req, res) => {
  if (req.body.add === "new") {
    return res.render("new", { assets: assetTags() });
  }

  currentUserId = Number(req.body.user);
  res.redirect("/");
});

// Add a new user to the database.
app.post("/new", requireLogin, async (req, res) => {
  const { name, color } = req.body;
  const row = (
    await query(
      "INSERT INTO users (name, color) VALUES ($1, $2) RETURNING *;",
      [name, color || "teal"]
    )
  )[0];

  currentUserId = row.id;
  res.redirect("/");
});

// Add or remove a visited country for the user.
app.post("/toggle", requireLogin, async (req, res) => {
  const { code } = req.body;
  const uid = currentUserId;

  try {
    const existing = await query(
      "SELECT 1 FROM visited_countries WHERE user_id = $1 AND country_code = $2",
      [uid, code]
    );

    if (existing.length) {
      await query(
        "DELETE FROM visited_countries WHERE user_id = $1 AND country_code = $2",
        [uid, code]
      );
      return res.json({ status: "removed" });
    }

    await query(
      `
      INSERT INTO visited_countries (country_code, user_id, visited_on)
      VALUES ($1, $2, $3)
      ON CONFLICT DO NOTHING;
      `,
      [code, uid, null]
    );

    return res.json({ status: "added" });
  } catch (err) {
    console.error("Toggle error:", code, err);
    res.status(400).json({ error: err.message || "Toggle failed" });
  }
});

// Handle server errors.
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).send(isDev ? `<pre>${err.stack}</pre>` : "Server error");
});

// Start the Express server.
if (process.env.NODE_ENV !== "production") {
  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
}

export default app;

