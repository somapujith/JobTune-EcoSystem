import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Shuffle, RotateCcw, Save, Trash2, BarChart3 } from 'lucide-react';
import { api } from '../store/useAuthStore';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const CARD_STATUSES = { UNSEEN: 'unseen', GOT_IT: 'got_it', REVIEW: 'review', DIFFICULT: 'difficult' };
const STUDY_MODES = [
  { id: 'all', label: 'Review All', icon: 'style' },
  { id: 'shuffle', label: 'Shuffle', icon: 'shuffle' },
  { id: 'difficult', label: 'Difficult Only', icon: 'priority_high' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function shuffleArray(arr) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function getDifficultyColor(d) {
  if (d === 'easy') return 'bg-emerald-500/20 text-emerald-400';
  if (d === 'hard') return 'bg-rose-500/20 text-rose-400';
  return 'bg-amber-500/20 text-amber-400';
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function AIFlashcards() {
  const [topic, setTopic] = useState('');
  const [cardCount, setCardCount] = useState(10);
  const [cards, setCards] = useState([]);
  const [cardStatuses, setCardStatuses] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [studyMode, setStudyMode] = useState('all');
  const [displayCards, setDisplayCards] = useState([]);
  const [showStats, setShowStats] = useState(false);
  const [savedDecks, setSavedDecks] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jt_flashcard_decks') || '[]'); }
    catch { return []; }
  });
  const [showDeckList, setShowDeckList] = useState(false);
  const [deckTopic, setDeckTopic] = useState('');

  // ── Derived stats ──────────────────────────────────────────────────────────

  const stats = (() => {
    const total = cards.length;
    const gotIt = Object.values(cardStatuses).filter(s => s === CARD_STATUSES.GOT_IT).length;
    const review = Object.values(cardStatuses).filter(s => s === CARD_STATUSES.REVIEW).length;
    const difficult = Object.values(cardStatuses).filter(s => s === CARD_STATUSES.DIFFICULT).length;
    const studied = gotIt + review + difficult;
    const accuracy = studied > 0 ? Math.round((gotIt / studied) * 100) : 0;
    return { total, gotIt, review, difficult, studied, accuracy };
  })();

  // ── Study mode filtering ──────────────────────────────────────────────────

  const applyStudyMode = useCallback((mode, allCards, statuses) => {
    let filtered;
    if (mode === 'difficult') {
      filtered = allCards.filter((_, i) => statuses[i] === CARD_STATUSES.DIFFICULT || statuses[i] === CARD_STATUSES.REVIEW);
      if (filtered.length === 0) filtered = allCards;
    } else if (mode === 'shuffle') {
      filtered = shuffleArray(allCards);
    } else {
      filtered = [...allCards];
    }
    setDisplayCards(filtered);
    setCurrentIndex(0);
    setIsFlipped(false);
  }, []);

  useEffect(() => {
    if (cards.length > 0) {
      applyStudyMode(studyMode, cards, cardStatuses);
    }
  }, [studyMode, cards, cardStatuses, applyStudyMode]);

  // ── API calls ──────────────────────────────────────────────────────────────

  async function generateFlashcards(topicOverride) {
    const t = (topicOverride || topic).trim();
    if (!t) { setError('Please enter a topic'); return; }
    setError('');
    setLoading(true);
    setShowDeckList(false);
    try {
      const { data } = await api.post('/study-tools/flashcards/generate', { topic: t, count: cardCount });
      if (data.success && data.data) {
        const newCards = data.data;
        setCards(newCards);
        setDisplayCards(newCards);
        setCardStatuses({});
        setCurrentIndex(0);
        setIsFlipped(false);
        setDeckTopic(t);
        setStudyMode('all');
      } else {
        setError('Failed to generate flashcards');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate flashcards');
    } finally {
      setLoading(false);
    }
  }

  // ── Card navigation ────────────────────────────────────────────────────────

  function goNext() {
    if (currentIndex < displayCards.length - 1) {
      setCurrentIndex(i => i + 1);
      setIsFlipped(false);
    }
  }

  function goPrev() {
    if (currentIndex > 0) {
      setCurrentIndex(i => i - 1);
      setIsFlipped(false);
    }
  }

  function markCard(status) {
    const card = displayCards[currentIndex];
    if (!card) return;
    const originalIndex = cards.indexOf(card);
    setCardStatuses(prev => ({ ...prev, [originalIndex]: status }));
    // Auto-advance after marking
    setTimeout(() => {
      if (currentIndex < displayCards.length - 1) goNext();
    }, 300);
  }

  // ── Deck management ────────────────────────────────────────────────────────

  function saveDeck() {
    if (cards.length === 0) return;
    const deck = {
      id: Date.now(),
      topic: deckTopic || topic,
      cards,
      cardStatuses,
      savedAt: new Date().toISOString(),
    };
    const updated = [deck, ...savedDecks].slice(0, 20);
    setSavedDecks(updated);
    localStorage.setItem('jt_flashcard_decks', JSON.stringify(updated));
  }

  function loadDeck(deck) {
    setCards(deck.cards);
    setCardStatuses(deck.cardStatuses || {});
    setDeckTopic(deck.topic);
    setTopic(deck.topic);
    setCurrentIndex(0);
    setIsFlipped(false);
    setShowDeckList(false);
    setStudyMode('all');
  }

  function deleteDeck(id) {
    const updated = savedDecks.filter(d => d.id !== id);
    setSavedDecks(updated);
    localStorage.setItem('jt_flashcard_decks', JSON.stringify(updated));
  }

  function resetProgress() {
    setCardStatuses({});
    setCurrentIndex(0);
    setIsFlipped(false);
  }

  // ── Spaced repetition hint ─────────────────────────────────────────────────

  function getSpacedRepetitionHint() {
    const difficult = Object.entries(cardStatuses)
      .filter(([, s]) => s === CARD_STATUSES.DIFFICULT || s === CARD_STATUSES.REVIEW)
      .length;
    if (difficult === 0) return null;
    return `${difficult} card${difficult > 1 ? 's' : ''} marked for review. Switch to "Difficult Only" mode to focus on them.`;
  }

  // ── Keyboard navigation ────────────────────────────────────────────────────

  useEffect(() => {
    function handleKey(e) {
      if (cards.length === 0) return;
      if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setIsFlipped(f => !f); }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });

  const currentCard = displayCards[currentIndex];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <span className="material-symbols-outlined text-3xl text-purple-500">style</span>
          <h1 className="font-headline text-2xl md:text-3xl text-on-surface font-bold">AI Flashcards</h1>
        </div>
        <p className="text-on-surface-variant text-sm md:text-base">Generate flashcards on any topic and study with spaced repetition.</p>
      </div>

      {/* Input + controls */}
      <div className="glass-card rounded-2xl p-6 mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && generateFlashcards()}
            placeholder="e.g., React Hooks, Python Decorators, SQL Joins..."
            className="flex-1 bg-surface-container border border-outline/20 rounded-xl px-4 py-3 text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-purple-500/40 transition-all"
          />
          <select
            value={cardCount}
            onChange={e => setCardCount(Number(e.target.value))}
            className="bg-surface-container border border-outline/20 rounded-xl px-3 py-3 text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40"
          >
            <option value={5}>5 cards</option>
            <option value={10}>10 cards</option>
            <option value={15}>15 cards</option>
          </select>
          <button
            onClick={() => generateFlashcards()}
            disabled={loading}
            className="px-5 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-sm transition-all disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
          >
            {loading ? (
              <><span className="material-symbols-outlined text-lg animate-spin">sync</span> Generating...</>
            ) : (
              <><span className="material-symbols-outlined text-lg">auto_awesome</span> Generate</>
            )}
          </button>
        </div>

        {/* Saved decks toggle */}
        <div className="flex items-center gap-3 mt-3">
          <button
            onClick={() => setShowDeckList(s => !s)}
            className="text-on-surface-variant text-xs hover:text-on-surface transition-colors flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-sm">folder_open</span>
            Saved Decks ({savedDecks.length})
          </button>
          {cards.length > 0 && (
            <>
              <button onClick={() => setShowStats(s => !s)} className="text-on-surface-variant text-xs hover:text-on-surface transition-colors flex items-center gap-1.5">
                <BarChart3 className="w-3.5 h-3.5" /> Stats
              </button>
              <button onClick={saveDeck} className="text-on-surface-variant text-xs hover:text-emerald-400 transition-colors flex items-center gap-1.5">
                <Save className="w-3.5 h-3.5" /> Save Deck
              </button>
              <button onClick={resetProgress} className="text-on-surface-variant text-xs hover:text-amber-400 transition-colors flex items-center gap-1.5">
                <RotateCcw className="w-3.5 h-3.5" /> Reset
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="glass-card rounded-2xl p-4 mb-6 border-l-4 border-red-500">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Saved decks list */}
      {showDeckList && (
        <div className="glass-card rounded-2xl p-5 mb-6">
          <h3 className="text-on-surface font-semibold text-sm mb-3">Saved Decks</h3>
          {savedDecks.length === 0 ? (
            <p className="text-on-surface-variant/50 text-xs">No saved decks yet</p>
          ) : (
            <div className="grid gap-2">
              {savedDecks.map(d => (
                <div key={d.id} className="flex items-center justify-between bg-surface-container/50 rounded-xl p-3 border border-outline/10">
                  <button onClick={() => loadDeck(d)} className="text-left flex-1 min-w-0">
                    <p className="text-on-surface text-sm font-medium truncate">{d.topic}</p>
                    <p className="text-on-surface-variant/50 text-xs">{d.cards.length} cards &middot; {new Date(d.savedAt).toLocaleDateString()}</p>
                  </button>
                  <button onClick={() => deleteDeck(d.id)} className="p-1.5 text-on-surface-variant/50 hover:text-red-400 transition-colors shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stats panel */}
      {showStats && cards.length > 0 && (
        <div className="glass-card rounded-2xl p-5 mb-6">
          <h3 className="text-on-surface font-semibold text-sm mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-purple-500" /> Study Statistics
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: 'Total', value: stats.total, color: 'text-blue-400' },
              { label: 'Studied', value: stats.studied, color: 'text-purple-400' },
              { label: 'Got It', value: stats.gotIt, color: 'text-emerald-400' },
              { label: 'Review', value: stats.review + stats.difficult, color: 'text-amber-400' },
              { label: 'Accuracy', value: `${stats.accuracy}%`, color: 'text-sky-400' },
            ].map((s, i) => (
              <div key={i} className="bg-surface-container/50 rounded-xl p-3 text-center border border-outline/10">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-on-surface-variant text-xs mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="glass-card rounded-2xl p-12 flex flex-col items-center justify-center">
          <div className="w-12 h-12 rounded-full border-3 border-purple-500 border-t-transparent animate-spin mb-4" />
          <p className="text-on-surface font-semibold">Generating flashcards...</p>
          <p className="text-on-surface-variant text-sm mt-1">Creating {cardCount} cards for you</p>
        </div>
      )}

      {/* Flashcard area */}
      {cards.length > 0 && !loading && (
        <>
          {/* Study mode tabs */}
          <div className="flex items-center gap-2 mb-4">
            {STUDY_MODES.map(m => (
              <button
                key={m.id}
                onClick={() => setStudyMode(m.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  studyMode === m.id
                    ? 'bg-purple-600 text-white'
                    : 'bg-surface-container/50 text-on-surface-variant border border-outline/20 hover:bg-surface-container'
                }`}
              >
                <span className="material-symbols-outlined text-sm">{m.icon}</span>
                {m.label}
              </button>
            ))}
          </div>

          {/* Progress bar */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-2 bg-surface-container/50 rounded-full overflow-hidden border border-outline/10">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-300 rounded-full"
                style={{ width: `${((currentIndex + 1) / displayCards.length) * 100}%` }}
              />
            </div>
            <span className="text-on-surface-variant text-xs font-medium shrink-0">
              {currentIndex + 1} / {displayCards.length}
            </span>
          </div>

          {/* Spaced repetition hint */}
          {getSpacedRepetitionHint() && studyMode === 'all' && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-500 text-lg">schedule</span>
              <p className="text-amber-400 text-xs">{getSpacedRepetitionHint()}</p>
            </div>
          )}

          {/* The card */}
          {currentCard && (
            <div className="perspective-1000 mb-6" style={{ perspective: '1000px' }}>
              <div
                onClick={() => setIsFlipped(f => !f)}
                className="relative w-full cursor-pointer transition-transform duration-500"
                style={{
                  transformStyle: 'preserve-3d',
                  transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                  minHeight: '280px',
                }}
              >
                {/* Front */}
                <div
                  className="absolute inset-0 glass-card rounded-2xl p-8 flex flex-col items-center justify-center text-center"
                  style={{ backfaceVisibility: 'hidden' }}
                >
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold mb-4 ${getDifficultyColor(currentCard.difficulty)}`}>
                    {currentCard.difficulty}
                  </span>
                  <p className="text-on-surface font-semibold text-lg md:text-xl leading-relaxed">{currentCard.front}</p>
                  <p className="text-on-surface-variant/40 text-xs mt-6">Click to flip</p>
                </div>

                {/* Back */}
                <div
                  className="absolute inset-0 glass-card rounded-2xl p-8 flex flex-col items-center justify-center text-center bg-gradient-to-br from-purple-900/20 to-blue-900/20"
                  style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                >
                  <span className="material-symbols-outlined text-purple-500 text-2xl mb-3">lightbulb</span>
                  <p className="text-on-surface text-base md:text-lg leading-relaxed">{currentCard.back}</p>
                  <p className="text-on-surface-variant/40 text-xs mt-6">Click to flip back</p>
                </div>
              </div>
            </div>
          )}

          {/* Navigation + marking */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            {/* Nav */}
            <div className="flex items-center gap-3">
              <button
                onClick={goPrev}
                disabled={currentIndex === 0}
                className="p-3 rounded-xl bg-surface-container/50 border border-outline/20 text-on-surface-variant hover:bg-surface-container disabled:opacity-30 transition-all"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={goNext}
                disabled={currentIndex === displayCards.length - 1}
                className="p-3 rounded-xl bg-surface-container/50 border border-outline/20 text-on-surface-variant hover:bg-surface-container disabled:opacity-30 transition-all"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* Mark buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => markCard(CARD_STATUSES.GOT_IT)}
                className="px-4 py-2 rounded-xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 text-sm font-semibold hover:bg-emerald-600/30 transition-all flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                Got it
              </button>
              <button
                onClick={() => markCard(CARD_STATUSES.REVIEW)}
                className="px-4 py-2 rounded-xl bg-amber-600/20 border border-amber-500/30 text-amber-400 text-sm font-semibold hover:bg-amber-600/30 transition-all flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-lg">schedule</span>
                Review Later
              </button>
              <button
                onClick={() => markCard(CARD_STATUSES.DIFFICULT)}
                className="px-4 py-2 rounded-xl bg-rose-600/20 border border-rose-500/30 text-rose-400 text-sm font-semibold hover:bg-rose-600/30 transition-all flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-lg">priority_high</span>
                Difficult
              </button>
            </div>
          </div>

          {/* Card status indicators */}
          <div className="flex flex-wrap gap-1.5 mt-6 justify-center">
            {displayCards.map((card, i) => {
              const origIdx = cards.indexOf(card);
              const status = cardStatuses[origIdx];
              let dotColor = 'bg-surface-container border-outline/20';
              if (status === CARD_STATUSES.GOT_IT) dotColor = 'bg-emerald-500';
              else if (status === CARD_STATUSES.REVIEW) dotColor = 'bg-amber-500';
              else if (status === CARD_STATUSES.DIFFICULT) dotColor = 'bg-rose-500';
              return (
                <button
                  key={i}
                  onClick={() => { setCurrentIndex(i); setIsFlipped(false); }}
                  className={`w-3 h-3 rounded-full border transition-all ${dotColor} ${i === currentIndex ? 'ring-2 ring-purple-500 ring-offset-1 ring-offset-transparent scale-125' : ''}`}
                />
              );
            })}
          </div>
        </>
      )}

      {/* Empty state */}
      {cards.length === 0 && !loading && !error && (
        <div className="glass-card rounded-2xl p-12 flex flex-col items-center justify-center text-center">
          <span className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-4">style</span>
          <h3 className="text-on-surface font-semibold text-lg mb-2">Create your flashcards</h3>
          <p className="text-on-surface-variant text-sm max-w-md mb-1">
            Enter a topic above to generate AI-powered flashcards. Use keyboard arrows to navigate and Space to flip.
          </p>
          <p className="text-on-surface-variant/50 text-xs">Tip: Mark cards as "Difficult" to focus on them later</p>
        </div>
      )}
    </div>
  );
}
