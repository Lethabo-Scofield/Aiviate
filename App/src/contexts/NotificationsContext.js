import React, { createContext, useContext, useState, useCallback } from 'react';
import { notifications as seedNotifications } from '../data';

const NotificationsContext = createContext();

export const useNotifications = () => {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider');
  return ctx;
};

export const NotificationsProvider = ({ children }) => {
  const [items, setItems] = useState(() => seedNotifications.map((n) => ({ ...n })));

  const markAllRead = useCallback(() => {
    setItems((prev) => prev.map((n) => ({ ...n, unread: false })));
  }, []);

  const markRead = useCallback((id) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, unread: false } : n)));
  }, []);

  const push = useCallback((notif) => {
    setItems((prev) => [
      { id: `N${Date.now()}`, time: 'Just now', unread: true, ...notif },
      ...prev,
    ]);
  }, []);

  const unreadCount = items.filter((n) => n.unread).length;

  return (
    <NotificationsContext.Provider value={{ items, unreadCount, markAllRead, markRead, push }}>
      {children}
    </NotificationsContext.Provider>
  );
};
