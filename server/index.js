import "dotenv/config";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import bcrypt from "bcrypt";
import { query } from "./db.js";

// Get file path in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check if the app is running in development mode
const isDev = process.env.NODE_ENV !== "production";

// Create the Express app
const app = express();

// Static files from the public folder
app.use(express.static(path.join(process.cwd(), "public")));

// Set up EJS as the view engine
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Data and JSON in requests
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Login route path and cookie name
const LOGIN_PATH = process.env.LOGIN_PATH || "/login";
const AUTH_COOKIE_NAME = "demo_user_id";

// Turn the cookie string into an object
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

// Get the logged-in user id from the cookie
function getLoggedInUserId(req) {
  const cookies = parseCookies(req.headers.cookie);
  const raw = cookies[AUTH_COOKIE_NAME];
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Create the login cookie
function buildAuthCookie(userId) {
  const secure = !isDev ? "; Secure" : "";
  return `${AUTH_COOKIE_NAME}=${encodeURIComponent(
    String(userId)
  )}; HttpOnly; Path=/; SameSite=Lax${secure}`;
}

// Clear the login cookie
function clearAuthCookie() {
  const secure = !isDev ? "; Secure" : "";
  return `${AUTH_COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure}`;
}

// Get all users from the database
async function getUsers() {
  return await query("SELECT * FROM users ORDER BY id ASC;");
}

// Get one user by id
async function getUserById(id) {
  const rows = await query(
    `
    SELECT id, name, color
    FROM users
    WHERE id = $1
    LIMIT 1;
    `,
    [id]
  );

  return rows[0] || null;
}

// Get one user by name for login
async function getUserByName(name) {
  const rows = await query(
    `
    SELECT id, name, color, password_hash
    FROM users
    WHERE LOWER(name) = LOWER($1)
    LIMIT 1;
    `,
    [String(name || "").trim()]
  );

  return rows[0] || null;
}

// Protect routes so only logged-in users can access them
async function requireLogin(req, res, next) {
  try {
    const userId = getLoggedInUserId(req);

    if (!userId) {
      return res.redirect(LOGIN_PATH);
    }

    const user = await getUserById(userId);

    if (!user) {
      res.setHeader("Set-Cookie", clearAuthCookie());
      return res.redirect(LOGIN_PATH);
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

// Variables for Vite in dev and manifest in production
let vite;
let manifest;

// Use Vite middleware in development
if (isDev) {
  const { createServer } = await import("vite");
  vite = await createServer({
    configFile: path.join(process.cwd(), "vite.config.js"),
    server: { middlewareMode: true }
  });
  app.use(vite.middlewares);
} else {
  // Serve built assets in production
  app.use(
    "/assets",
    express.static(path.join(process.cwd(), "dist", "assets"), { maxAge: "1y" })
  );
  manifest = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "dist", "manifest.json"), "utf-8")
  );
}

// Load the correct CSS and JS files
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

// Get all visited countries for one user
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

// Get the most recent activity for one user
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

// Build dashboard stats for one user
async function getStats(uid) {
  const [{ count: totalCountries } = { count: 0 }] = await query(
    `SELECT COUNT(*)::int AS count FROM visited_countries WHERE user_id = $1;`,
    [uid]
  );

  // Placeholder until continent logic is added
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

  // Milestones used for the travel goal card
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

// Get combined visit data for all users
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

// Show the login page
app.get(LOGIN_PATH, async (req, res, next) => {
  try {
    const users = await getUsers();

    if (!users.length) {
      return res.redirect("/setup");
    }

    const userId = getLoggedInUserId(req);

    if (userId) {
      const user = await getUserById(userId);
      if (user) {
        return res.redirect("/");
      }
    }

    res.render("login", {
      assets: assetTags(),
      error: null,
      formAction: LOGIN_PATH,
      pageTitle: "Login",
      subtitle: "Sign in"
    });
  } catch (err) {
    next(err);
  }
});

// Handle login form submission
app.post(LOGIN_PATH, async (req, res, next) => {
  try {
    const name = String(req.body.username || "").trim();
    const password = String(req.body.password || "");

    if (!name || !password) {
      return res.status(401).render("login", {
        assets: assetTags(),
        error: "Enter both name and password.",
        formAction: LOGIN_PATH,
        pageTitle: "Login",
        subtitle: "Sign in"
      });
    }

    const user = await getUserByName(name);

    if (!user || !user.password_hash) {
      return res.status(401).render("login", {
        assets: assetTags(),
        error: "Incorrect name or password.",
        formAction: LOGIN_PATH,
        pageTitle: "Login",
        subtitle: "Sign in"
      });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      return res.status(401).render("login", {
        assets: assetTags(),
        error: "Incorrect name or password.",
        formAction: LOGIN_PATH,
        pageTitle: "Login",
        subtitle: "Sign in"
      });
    }

    res.setHeader("Set-Cookie", buildAuthCookie(user.id));
    return res.redirect("/");
  } catch (err) {
    next(err);
  }
});

// Log the user out
app.post("/logout", (_req, res) => {
  res.setHeader("Set-Cookie", clearAuthCookie());
  res.redirect(LOGIN_PATH);
});

// Show the main dashboard
app.get("/", requireLogin, async (req, res, next) => {
  try {
    const users = await getUsers();
    if (!users.length) return res.redirect("/setup");

    const currentUser = req.user;
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

// Show the personal map page
app.get("/map", requireLogin, async (req, res, next) => {
  try {
    const users = await getUsers();
    if (!users.length) return res.redirect("/setup");

    const currentUser = req.user;
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

// Show the family map placeholder page
app.get("/family-map", requireLogin, async (req, res, next) => {
  try {
    const users = await getUsers();
    if (!users.length) {
      return res.redirect("/setup");
    }

    const currentUser = req.user;

    res.render("family-map", {
      title: "Family map · Coming Soon",
      assets: assetTags(),
      currentUser
    });
  } catch (err) {
    next(err);
  }
});

// Show setup instructions if the database is empty
app.get("/setup", (_req, res) => {
  res.send(`<pre>Run your SQL in sql/schema.sql, then revisit /</pre>`);
});

// Add a country visit from the dashboard form
app.post("/add", requireLogin, async (req, res) => {
  const { country, visited_on } = req.body;
  const trimmedCountry = String(country || "").trim();

  try {
    if (!trimmedCountry) {
      throw new Error("Please enter a valid country.");
    }

    // Try to match the country name from the database
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

    // Save the visit for the logged-in user
    await query(
      `
      INSERT INTO visited_countries (country_code, user_id, visited_on)
      VALUES ($1, $2, $3)
      ON CONFLICT DO NOTHING;
      `,
      [row.country_code, req.user.id, visited_on || null]
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

// Placeholder route for switching users later
app.post("/user", requireLogin, (_req, res) => {
  res.redirect("/");
});

// Placeholder route for creating users later
app.post("/new", requireLogin, (_req, res) => {
  res.redirect("/");
});

// Toggle a country on or off from the interactive map
app.post("/toggle", requireLogin, async (req, res) => {
  const code = String(req.body.code || "")
    .trim()
    .toUpperCase();
  const uid = req.user.id;

  try {
    if (!code) {
      return res.status(400).json({ error: "Missing country code." });
    }

    const existing = await query(
      "SELECT 1 FROM visited_countries WHERE user_id = $1 AND country_code = $2",
      [uid, code]
    );

    // Remove the country if it already exists
    if (existing.length) {
      await query(
        "DELETE FROM visited_countries WHERE user_id = $1 AND country_code = $2",
        [uid, code]
      );
      return res.json({ status: "removed" });
    }

    // Add the country if it does not exist yet
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

// Basic error handler
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).send(isDev ? `<pre>${err.stack}</pre>` : "Server error");
});

// Start the local server in development
if (process.env.NODE_ENV !== "production") {
  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
}

// Export the app for production/serverless use
export default app;