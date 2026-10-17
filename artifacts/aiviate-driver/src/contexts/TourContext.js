// First-run walkthrough for the Driver App.
//
// The tour plays automatically the first time a driver signs in on this
// device. "Replay app tour" (Profile or Learn) runs it one more time, after
// which it is marked done again.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from './AuthContext';

export const TOUR_STEPS = [
  {
    tab: 'Jobs',
    icon: 'sparkles-outline',
    title: 'Welcome aboard',
    body: "Here's a quick look around the Aiviate Driver app. It takes under a minute.",
  },
  {
    tab: 'Jobs',
    icon: 'bed-outline',
    title: 'Pre-drive check-in',
    body: 'At the top of Routes, answer four quick questions about sleep and tiredness before your first route each day. If you are at risk, dispatch is told so they can help. Being honest never gets you in trouble.',
  },
  {
    tab: 'Jobs',
    icon: 'map-outline',
    title: 'Routes',
    body: 'New routes from dispatch appear here. Check the stops, then tap Accept route.',
  },
  {
    tab: 'Active',
    icon: 'navigate-outline',
    title: 'Active route',
    body: 'Follow your stops in order, tap to navigate, and complete each delivery with a scan and the recipient’s name.',
  },
  {
    tab: 'Earnings',
    icon: 'time-outline',
    title: 'History',
    body: 'Every route and delivery you have finished, in one place.',
  },
  {
    tab: 'Community',
    icon: 'chatbubbles-outline',
    title: 'Community',
    body: 'Share road updates and safety warnings with other drivers, ask questions, and read notices from dispatch.',
  },
  {
    tab: 'Learn',
    icon: 'book-outline',
    title: 'Learn',
    body: 'Short guides on using the app and staying alert on the road.',
  },
  {
    tab: 'Jobs',
    icon: 'person-circle-outline',
    title: 'Replay any time',
    body: 'Tap your photo (top right) → Replay app tour to see this again.',
  },
];

const TourContext = createContext(null);

export const useTour = () => {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used within TourProvider');
  return ctx;
};

const keyFor = (user) => `aiviate_tour_done:driver:${user?.id || 'anon'}`;

export const TourProvider = ({ children }) => {
  const { user, status } = useAuth();
  const [index, setIndex] = useState(-1);
  const storageKey = keyFor(user);

  useEffect(() => {
    if (status !== 'signedIn' || !user) { setIndex(-1); return undefined; }
    let cancelled = false;
    let timer;
    AsyncStorage.getItem(storageKey)
      .then((done) => {
        if (!cancelled && done !== 'done') timer = setTimeout(() => setIndex(0), 800);
      })
      .catch(() => {});
    return () => { cancelled = true; clearTimeout(timer); };
  }, [status, user, storageKey]);

  const finish = useCallback(() => {
    setIndex(-1);
    AsyncStorage.setItem(storageKey, 'done').catch(() => {});
  }, [storageKey]);

  const next = useCallback(() => {
    setIndex((i) => {
      if (i >= TOUR_STEPS.length - 1) {
        AsyncStorage.setItem(storageKey, 'done').catch(() => {});
        return -1;
      }
      return i + 1;
    });
  }, [storageKey]);

  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const replay = useCallback(() => setIndex(0), []);

  const value = useMemo(() => ({
    index,
    step: index >= 0 ? TOUR_STEPS[index] : null,
    total: TOUR_STEPS.length,
    next,
    back,
    finish,
    replay,
  }), [index, next, back, finish, replay]);

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
};

export default TourProvider;
