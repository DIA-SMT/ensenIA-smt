import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { Notification } from '../types';
import { getNotificationsForUser } from '../data/mockNotifications';
import { useAuth } from './AuthContext';

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (notificationId: string) => void;
  markAllAsRead: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  // Local copy of notifications (so we can mark as read)
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const allNotifs = user ? getNotificationsForUser(user.id) : [];

  // Merge mock read state with our local read state
  const notifications = allNotifs.map(n => ({
    ...n,
    isRead: n.isRead || readIds.has(n.id),
  }));

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const markAsRead = useCallback((id: string) => {
    setReadIds(prev => new Set(prev).add(id));
  }, []);

  const markAllAsRead = useCallback(() => {
    setReadIds(prev => {
      const next = new Set(prev);
      allNotifs.forEach(n => next.add(n.id));
      return next;
    });
  }, [allNotifs]);

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markAsRead, markAllAsRead }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextType {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
