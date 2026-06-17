-- Subscription plans table
CREATE TABLE IF NOT EXISTS subscription_plans (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  tier_level INT NOT NULL,
  description TEXT,
  price DECIMAL(10, 2),
  features TEXT[], -- array of tool names
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User subscriptions table
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  plan_id INT NOT NULL REFERENCES subscription_plans(id),
  selected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(20) DEFAULT 'active',
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Onboarding responses table
CREATE TABLE IF NOT EXISTS onboarding_responses (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  career_goal VARCHAR(100),
  experience_level VARCHAR(50),
  pain_points TEXT[],
  recommended_plan_id INT REFERENCES subscription_plans(id),
  completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Insert default plans
INSERT INTO subscription_plans (name, tier_level, description, price, features) VALUES
('Learn & Build', 1, 'Build the skills, projects, and portfolio needed for your dream career.', 199, ARRAY['Skill Assessment', 'Career Roadmap', 'Learning Hub', 'Project Builder', 'Portfolio Builder']),
('Tune & Polish', 2, 'Turn your existing skills into a recruiter-ready professional profile.', 299, ARRAY['Skill Assessment', 'Career Roadmap', 'Learning Hub', 'Project Builder', 'Portfolio Builder', 'Resume Optimizer', 'ATS Checker', 'LinkedIn Optimizer', 'GitHub Optimizer', 'Recruiter Visibility Checker', 'Application Assistant']),
('Zero to Hero', 3, 'The complete career transformation ecosystem.', 499, ARRAY['Skill Assessment', 'Career Roadmap', 'Learning Hub', 'Project Builder', 'Portfolio Builder', 'Resume Optimizer', 'ATS Checker', 'LinkedIn Optimizer', 'GitHub Optimizer', 'Recruiter Visibility Checker', 'Application Assistant', 'Interview Prep', 'Job Analytics', 'Career Readiness Dashboard'])
ON CONFLICT (name) DO NOTHING;
