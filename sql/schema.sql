-- Family Travel Tracker - Database Schema
-- PostgreSQL / Supabase

DROP TABLE IF EXISTS visited_countries;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS countries;

CREATE TABLE countries (
  country_code CHAR(2) PRIMARY KEY,
  country_name TEXT NOT NULL UNIQUE
);

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(32) NOT NULL UNIQUE,
  color VARCHAR(24) NOT NULL DEFAULT 'teal'
);

CREATE TABLE visited_countries (
  id SERIAL PRIMARY KEY,
  country_code CHAR(2) NOT NULL REFERENCES countries(country_code) ON DELETE CASCADE ON UPDATE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  visited_on DATE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT visited_countries_user_country_unique UNIQUE (user_id, country_code)
);


-- (SEED DATA) 
-- The following inserts is for demo purposes
INSERT INTO users (name, color) VALUES
  ('Angela', 'teal'),
  ('Jack', 'powderblue'),
  ('Demo', 'salmon')
ON CONFLICT (name) DO NOTHING;

INSERT INTO countries (country_code, country_name) VALUES
  ('FR', 'France'),
  ('GB', 'United Kingdom'),
  ('CA', 'Canada'),
  ('US', 'United States'),
  ('JP', 'Japan'),
  ('IT', 'Italy'),
  ('ES', 'Spain'),
  ('DE', 'Germany'),
  ('AU', 'Australia'),
  ('BR', 'Brazil')
ON CONFLICT (country_code) DO NOTHING;

INSERT INTO visited_countries (country_code, user_id, visited_on) VALUES
  ('FR', 1, '2024-05-15'),
  ('GB', 1, '2024-08-10'),
  ('IT', 1, '2024-06-02'),

  ('CA', 2, '2023-11-01'),
  ('US', 2, '2024-02-14'),

  ('JP', 3, '2022-09-21'),
  ('AU', 3, '2023-03-05')