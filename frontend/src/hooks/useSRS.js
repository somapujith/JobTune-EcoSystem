import { useState, useEffect, useCallback } from 'react';
import { api } from '../store/useAuthStore';
import useAuthStore from '../store/useAuthStore';

export function useSRS() {
  const { isAuthenticated } = useAuthStore();
  const [decks, setDecks] = useState([]);
  const [dueCards, setDueCards] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchDecks = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await api.get('/study-history/srs/decks');
      setDecks(res.data.data || []);
    } catch (err) {
      console.warn('Failed to fetch SRS decks:', err.message);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  const fetchDueCards = useCallback(async (deckId = null) => {
    if (!isAuthenticated) return;
    try {
      const params = deckId ? `?deckId=${deckId}&limit=20` : '?limit=20';
      const res = await api.get(`/study-history/srs/due${params}`);
      setDueCards(res.data.data || []);
    } catch (err) {
      console.warn('Failed to fetch due cards:', err.message);
    }
  }, [isAuthenticated]);

  useEffect(() => { fetchDecks(); fetchDueCards(); }, [fetchDecks, fetchDueCards]);

  const saveDeck = useCallback(async (deckId, cards) => {
    if (!isAuthenticated) return;
    try {
      await api.post('/study-history/srs/decks', { deckId, cards });
      fetchDecks();
    } catch (err) {
      console.warn('Failed to save SRS deck:', err.message);
    }
  }, [isAuthenticated, fetchDecks]);

  const reviewCard = useCallback(async (cardId, quality) => {
    if (!isAuthenticated) return null;
    try {
      const res = await api.post('/study-history/srs/review', { cardId, quality });
      return res.data.data;
    } catch (err) {
      console.warn('Failed to review card:', err.message);
      return null;
    }
  }, [isAuthenticated]);

  return { decks, dueCards, isLoading, saveDeck, reviewCard, fetchDueCards, refetch: fetchDecks };
}
