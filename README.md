Family Travel Tracker
A full-stack travel tracking application that allows users to log countries they’ve visited and visualize their travel history on an interactive world map.
This project was built as part of my developer portfolio to demonstrate full-stack web development using Node.js, Express, PostgreSQL, and frontend tooling. It combines server-rendered views with client-side interactivity to create a dynamic travel tracking experience.

How it Works
The application renders pages using EJS templates on the server. When a user loads the map page, the backend passes their visited country data to the frontend.
The frontend loads an SVG world map and dynamically applies styles to the countries based on the user's data. This approach keeps the UI responsive while ensuring all data remains stored in PostgreSQL.

When a country is clicked:
A request is sent to the server
The server updates the database
The map updates to reflect the new visit status

Tech Stack
Frontend : HTML, CSS, JavaScript, EJS 
Backend: Node.js, Express.js
Database: PostgreSQL
Build Tool: Vite

Features
User Dashboard:
View total countries visited
See recent travel activity
Display a list of visited countries

Interactive World Map:
Countries are highlighted when marked as visited
Hover tooltips display country names
Click countries to toggle visited status

User Profiles:
Create new users
Each user has their own travel history
Users can be assigned custom accent colors

Database Integration:
All travel data is stored in PostgreSQL
Each visit is tied to a specific user
Data persists across sessions

Family Mode (Planned Feature):
Combined map showing travel history across multiple users
Countries visited by multiple people will be visually differentiated


Installation 
git clone https://github.com/YOUR-USERNAME/family-travel-tracker.git
cd family-travel-tracker
npm install

Database Setup:
Create a PostgreSQL database and run the schema used for the project. Can be found in schema.sql Each visit entry links a user ID with a country code.
The database stores:
Users
countries
visited countries

Environment Variables
Create a .env file in the root of the project:

DATABASE_URL=yourPostgresqlConnectionString
SUPABASE_URL=yourSupabaseUrl
SUPABASE_KEY=yourSupabaseKey

PORT=3000
NODE_ENV=development

LOGIN_PATH=/hidden-demo
LOGIN_USERNAME=createYourOwnUsername
LOGIN_PASSWORD=createYourOwnPassword

Running the Application
npm run dev
Then open http://localhost:3000 on your browser


