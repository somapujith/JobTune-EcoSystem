import { useState } from 'react';
import { ArrowRight, Calendar, User } from 'lucide-react';
import { Link } from 'react-router-dom';

const BlogPost = {
  1: {
    id: 1,
    title: 'Why AI Resume Optimization is Changing the Job Search Game',
    author: 'JobTube Team',
    date: 'April 20, 2026',
    category: 'Resume Tips',
    excerpt: 'Discover how AI-powered resume analysis improves ATS scores and lands more interviews.',
    readTime: '5 min read',
    image: 'bg-gradient-to-br from-blue-500 to-blue-600',
    content: `
      <h2 class="text-2xl font-bold mb-4">Why AI Resume Optimization is Changing the Job Search Game</h2>

      <p class="mb-4 text-lg">Freshers often struggle with one fundamental question: "Will my resume even get past the first filter?" In today's job market, most companies use Applicant Tracking Systems (ATS) to scan resumes before a human ever sees them.</p>

      <h3 class="text-xl font-bold mb-3 mt-6">The ATS Problem</h3>
      <p class="mb-4">ATS systems look for specific keywords, formatting, and structure. A beautifully designed resume in Canva? It might fail to parse. Missing industry keywords? Instant rejection, no matter your experience.</p>

      <h3 class="text-xl font-bold mb-3 mt-6">How AI Changes the Game</h3>
      <p class="mb-4">AI resume optimizers analyze your content against job descriptions, identify missing keywords, suggest formatting improvements, and provide real-time ATS scoring. This means:</p>
      <ul class="list-disc list-inside mb-4 space-y-2">
        <li>Understand what keywords your industry cares about</li>
        <li>See exactly why your resume scored 65/100 and how to hit 95</li>
        <li>Get actionable feedback in seconds, not weeks</li>
        <li>Track improvements across multiple resume versions</li>
      </ul>

      <h3 class="text-xl font-bold mb-3 mt-6">The Real Impact</h3>
      <p class="mb-4">Users of JobTube's Resume Optimizer report a 40% increase in interview calls within the first month. Why? Because they're tailoring resumes to what hiring systems actually value—not what looks good on paper.</p>

      <p class="mt-6 text-sm text-slate-500">Share this article to help a fresher ace their resume.</p>
    `
  },
  2: {
    id: 2,
    title: 'Mock Interviews: The Secret Weapon for Job Interview Success',
    author: 'Sarah Chen',
    date: 'April 18, 2026',
    category: 'Interview Prep',
    excerpt: 'Learn how AI-powered mock interviews build confidence and improve your STAR method technique.',
    readTime: '6 min read',
    image: 'bg-gradient-to-br from-purple-500 to-purple-600',
    content: `
      <h2 class="text-2xl font-bold mb-4">Mock Interviews: The Secret Weapon for Job Interview Success</h2>

      <p class="mb-4 text-lg">Imagine this: It's your dream job interview. You're asked "Tell me about a time you failed." Your mind goes blank. You stammer. You lose the job.</p>

      <h3 class="text-xl font-bold mb-3 mt-6">Why Mock Interviews Matter</h3>
      <p class="mb-4">Real interviews are high-pressure. Your first attempt shouldn't be on the actual job you want. Mock interviews let you practice in a low-stakes environment where feedback is instant and judgment-free.</p>

      <h3 class="text-xl font-bold mb-3 mt-6">The STAR Method Advantage</h3>
      <p class="mb-4">Most job interview questions are behavioral: "Tell me about a time..." The STAR method (Situation, Task, Action, Result) is the golden standard. JobTube's AI interviewer doesn't just ask questions—it scores your answers using STAR methodology:</p>
      <ul class="list-disc list-inside mb-4 space-y-2">
        <li><strong>Situation:</strong> Did you set up context?</li>
        <li><strong>Task:</strong> What was the challenge?</li>
        <li><strong>Action:</strong> What did YOU do?</li>
        <li><strong>Result:</strong> What was the measurable outcome?</li>
      </ul>

      <h3 class="text-xl font-bold mb-3 mt-6">Real Results</h3>
      <p class="mb-4">Candidates who practice 5+ mock interviews report 60% higher confidence in real interviews. They know their stories. They know their strengths. And interviewers feel that confidence.</p>

      <p class="mt-6">Start practicing today. Your future self will thank you.</p>
    `
  },
  3: {
    id: 3,
    title: 'LinkedIn Profile Optimization: From Invisible to Unstoppable',
    author: 'Raj Patel',
    date: 'April 16, 2026',
    category: 'Career Growth',
    excerpt: 'Transform your LinkedIn profile into a recruitment magnet with data-driven optimization strategies.',
    readTime: '7 min read',
    image: 'bg-gradient-to-br from-indigo-500 to-indigo-600',
    content: `
      <h2 class="text-2xl font-bold mb-4">LinkedIn Profile Optimization: From Invisible to Unstoppable</h2>

      <p class="mb-4 text-lg">LinkedIn is where recruiters hunt for talent. But most fresher profiles are incomplete, generic, or buried in search results. Here's how to become visible—and unforgettable.</p>

      <h3 class="text-xl font-bold mb-3 mt-6">The LinkedIn Visibility Problem</h3>
      <p class="mb-4">LinkedIn's algorithm prioritizes profiles that:</p>
      <ul class="list-disc list-inside mb-4 space-y-2">
        <li>Include industry-specific keywords (found in job descriptions you target)</li>
        <li>Have a strong headline (not just "Student at XYZ")</li>
        <li>Use a professional photo with good lighting and neutral background</li>
        <li>Have a populated "About" section with personality and purpose</li>
        <li>Show consistent activity (posts, comments, engagement)</li>
      </ul>

      <h3 class="text-xl font-bold mb-3 mt-6">The Optimization Playbook</h3>
      <p class="mb-4">JobTube's LinkedIn Optimizer analyzes your profile and recommends specific improvements:</p>
      <ul class="list-disc list-inside mb-4 space-y-2">
        <li>Better headline keywords for your target role</li>
        <li>About section rewrite with impact metrics</li>
        <li>Key skills to add (backed by job market data)</li>
        <li>Experience section wording that resonates</li>
      </ul>

      <h3 class="text-xl font-bold mb-3 mt-6">What Happens Next</h3>
      <p class="mb-4">Within 2 weeks of implementing optimizations, most users report:</p>
      <ul class="list-disc list-inside mb-4 space-y-2">
        <li>Increased recruiter messages (2-3x)</li>
        <li>More profile views from decision-makers</li>
        <li>Higher connection acceptance rates</li>
      </ul>

      <p class="mt-6">Your LinkedIn profile is your personal brand. Make it count.</p>
    `
  },
  4: {
    id: 4,
    title: 'GitHub for Career Growth: Making Your Code Work for You',
    author: 'Maria Rodriguez',
    date: 'April 14, 2026',
    category: 'Developer Portfolio',
    excerpt: 'Stop letting great code sit in private repos. Here\'s how to showcase your projects and land developer jobs.',
    readTime: '6 min read',
    image: 'bg-gradient-to-br from-slate-600 to-slate-700',
    content: `
      <h2 class="text-2xl font-bold mb-4">GitHub for Career Growth: Making Your Code Work for You</h2>

      <p class="mb-4 text-lg">For developers, GitHub is your portfolio. A strong GitHub profile can land interviews without a single line of resume text. But most fresher developers don't realize what makes a GitHub profile shine.</p>

      <h3 class="text-xl font-bold mb-3 mt-6">The Hidden Potential of GitHub</h3>
      <p class="mb-4">Hiring managers and recruiters now regularly check GitHub profiles. They want to see:</p>
      <ul class="list-disc list-inside mb-4 space-y-2">
        <li>Public projects with clean, readable code</li>
        <li>Meaningful commit messages (not "fix bug" repeated 50 times)</li>
        <li>Well-written READMEs that explain what your project does</li>
        <li>Active contribution history (consistency matters)</li>
        <li>Projects that solve real problems</li>
      </ul>

      <h3 class="text-xl font-bold mb-3 mt-6">Common GitHub Mistakes</h3>
      <p class="mb-4">❌ Too many abandoned projects with no README</p>
      <p class="mb-4">❌ Private repositories (recruiters can't see your work)</p>
      <p class="mb-4">❌ Copied projects without attribution or personal contribution</p>
      <p class="mb-4">❌ No projects at all (relying entirely on coursework)</p>

      <h3 class="text-xl font-bold mb-3 mt-6">The GitHub Optimizer Advantage</h3>
      <p class="mb-4">JobTube's GitHub Optimizer scans your profile and suggests:</p>
      <ul class="list-disc list-inside mb-4 space-y-2">
        <li>Which projects to feature and how to improve their READMEs</li>
        <li>Missing documentation that would make projects more impressive</li>
        <li>Profile completeness gaps (bio, website link, location)</li>
        <li>Visibility improvements (pinned projects, README badges)</li>
      </ul>

      <p class="mt-6">Your code is your voice. Make it heard.</p>
    `
  },
  5: {
    id: 5,
    title: 'From 10 Applications to 3 Interviews: The Job Tracker Strategy',
    author: 'Alex Kim',
    date: 'April 12, 2026',
    category: 'Job Search',
    excerpt: 'Organize your job search, track follow-ups, and measure what actually works with data-driven job tracking.',
    readTime: '5 min read',
    image: 'bg-gradient-to-br from-emerald-500 to-emerald-600',
    content: `
      <h2 class="text-2xl font-bold mb-4">From 10 Applications to 3 Interviews: The Job Tracker Strategy</h2>

      <p class="mb-4 text-lg">Here's a depressing statistic: Most freshers apply to 50+ jobs and get 2-3 interviews. The problem? They apply blindly, forget to follow up, and never measure what works.</p>

      <h3 class="text-xl font-bold mb-3 mt-6">The Job Search Black Hole</h3>
      <p class="mb-4">Without tracking, your job search becomes a mess:</p>
      <ul class="list-disc list-inside mb-4 space-y-2">
        <li>You forget which companies you applied to</li>
        <li>You miss follow-up deadlines</li>
        <li>You repeat the same mistakes across applications</li>
        <li>You have no data on what resume version actually converts</li>
        <li>You get frustrated and give up</li>
      </ul>

      <h3 class="text-xl font-bold mb-3 mt-6">The Kanban Method</h3>
      <p class="mb-4">JobTube uses a Kanban board to visualize your pipeline:</p>
      <ul class="list-disc list-inside mb-4 space-y-2">
        <li><strong>Applied:</strong> Submitted but no response</li>
        <li><strong>Interview:</strong> Got the interview, preparing</li>
        <li><strong>Offer:</strong> Negotiating terms</li>
        <li><strong>Rejected:</strong> Learning from rejection</li>
      </ul>

      <h3 class="text-xl font-bold mb-3 mt-6">The Power of Data</h3>
      <p class="mb-4">By tracking every application, you discover patterns:</p>
      <ul class="list-disc list-inside mb-4 space-y-2">
        <li>Which resume gets better response rates?</li>
        <li>Which types of companies interview you more?</li>
        <li>What's your interview-to-offer rate?</li>
        <li>When should you follow up?</li>
      </ul>

      <h3 class="text-xl font-bold mb-3 mt-6">The Real Win</h3>
      <p class="mb-4">Candidates who track every application and follow up strategically go from 50 applications → 5 interviews → 2+ offers. Quality over quantity wins.</p>

      <p class="mt-6">Track. Learn. Optimize. Repeat.</p>
    `
  }
};

const BlogList = () => {
  const [selectedPost, setSelectedPost] = useState(null);

  if (selectedPost) {
    return (
      <div className="w-full max-w-4xl mx-auto py-16 px-4 sm:px-6">
        <div className="mx-auto">
          <button
            onClick={() => setSelectedPost(null)}
            className="flex items-center gap-2 text-sky-600 hover:text-sky-700 mb-8 font-bold transition"
          >
            ← Back to Blog
          </button>

          <article className="glass-card rounded-3xl p-8">
            <div className={`w-full h-64 rounded-lg mb-8 ${BlogPost[selectedPost].image}`} />

            <div className="flex flex-wrap gap-4 mb-6 text-sm text-on-surface-variant font-medium">
              <div className="flex items-center gap-2">
                <Calendar size={16} />
                {BlogPost[selectedPost].date}
              </div>
              <div className="flex items-center gap-2">
                <User size={16} />
                {BlogPost[selectedPost].author}
              </div>
              <span className="px-3 py-1 glass-panel text-on-surface-variant rounded-full text-xs font-bold">
                {BlogPost[selectedPost].category}
              </span>
              <span className="text-on-surface-variant">{BlogPost[selectedPost].readTime}</span>
            </div>

            <div
              className="prose max-w-none text-on-surface prose-headings:text-on-surface prose-strong:text-on-surface"
              dangerouslySetInnerHTML={{ __html: BlogPost[selectedPost].content }}
            />
          </article>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto py-16 px-4 sm:px-6">
      {/* Hero */}
      <div className="max-w-6xl mx-auto px-6 py-20">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-black text-on-surface font-headline mb-4">
            JobTube Blog
          </h1>
          <p className="text-xl text-on-surface-variant font-medium max-w-2xl mx-auto">
            Career insights, job search strategies, and AI-powered optimization tips for freshers breaking into tech.
          </p>
        </div>

        {/* Blog Grid */}
        <div className="grid md:grid-cols-2 gap-8">
          {Object.values(BlogPost).map((post) => (
            <div
              key={post.id}
              onClick={() => setSelectedPost(post.id)}
              className="group cursor-pointer glass-card rounded-3xl overflow-hidden hover:shadow-lg hover:-translate-y-2 transition-all duration-300"
            >
              <div className={`w-full h-48 ${post.image} relative overflow-hidden`}>
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition" />
              </div>

              <div className="p-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2 py-1 glass-panel text-on-surface-variant rounded text-xs font-bold">
                    {post.category}
                  </span>
                  <span className="text-xs font-medium text-on-surface-variant">{post.readTime}</span>
                </div>

                <h2 className="text-xl font-bold text-on-surface font-headline mb-3 group-hover:text-sky-600 transition">
                  {post.title}
                </h2>

                <p className="text-on-surface-variant font-medium mb-4 text-sm line-clamp-2">
                  {post.excerpt}
                </p>

                <div className="flex items-center justify-between pt-4 border-t border-outline/10">
                  <div className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                    {post.date} • {post.author}
                  </div>
                  <ArrowRight
                    size={16}
                    className="text-sky-600 group-hover:translate-x-1 transition-transform"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Featured */}
        <div className="mt-20 glass-card border-blue-200/50 rounded-3xl p-8">
          <h3 className="text-2xl font-bold text-on-surface font-headline mb-4">
            💡 Pro Tip: Start Here
          </h3>
          <p className="text-on-surface-variant font-medium mb-6">
            First time optimizing your career? Start with <strong>"Why AI Resume Optimization..."</strong> and then move to <strong>"Mock Interviews."</strong> These two foundations will transform your job search in 30 days.
          </p>
          <button
            onClick={() => setSelectedPost(1)}
            className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg rounded-xl font-bold hover:from-blue-700 hover:to-indigo-700 transition-all inline-flex items-center gap-2"
          >
            Read Article <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default BlogList;
