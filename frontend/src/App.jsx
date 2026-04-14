import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import SkillAssessment from './pages/SkillAssessment';
import ResumeOptimizer from './pages/ResumeOptimizer';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import ContentVault from './pages/ContentVault';
import LinkedInOptimizer from './pages/LinkedInOptimizer';
import GitHubOptimizer from './pages/GitHubOptimizer';
import PortfolioBuilder from './pages/PortfolioBuilder';
import ProjectIdeas from './pages/ProjectIdeas';
import MockInterview from './pages/MockInterview';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="skills" element={<SkillAssessment />} />
        <Route path="resume" element={<ResumeOptimizer />} />
        <Route path="linkedin" element={<LinkedInOptimizer />} />
        <Route path="github" element={<GitHubOptimizer />} />
        <Route path="portfolio" element={<PortfolioBuilder />} />
        <Route path="learning" element={<ContentVault />} />
        <Route path="projects" element={<ProjectIdeas />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="interview" element={<MockInterview />} />
      </Route>
      <Route path="/login" element={<Login />} />
    </Routes>
  );
}

export default App;
