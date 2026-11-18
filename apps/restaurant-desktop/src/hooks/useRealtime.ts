import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createRestaurantSocket, type ConnectionState } from '../services/socket';

export function useRestaurantRealtime(params: {
  apiBaseUrl: string;
  accessToken?: string;
  restaurantId?: string;
  notificationsEnabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');

  useEffect(() => {
    if (!params.accessToken || !params.apiBaseUrl) {
      setConnectionState('disconnected');
      return;
    }

    setConnectionState('connecting');
    const socket = createRestaurantSocket(params.apiBaseUrl, params.accessToken, params.restaurantId);

    const refreshAll = () => {
      void queryClient.invalidateQueries({ queryKey: ['restaurant-dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['restaurant-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['restaurant-order'] });
      void queryClient.invalidateQueries({ queryKey: ['restaurant-deliveries'] });
      void queryClient.invalidateQueries({ queryKey: ['restaurant-notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['restaurant-payments'] });
    };

    socket.on('connect', () => {
      setConnectionState('connected');
      refreshAll();
    });

    socket.on('disconnect', () => {
      setConnectionState('disconnected');
    });

    socket.on('connect_error', () => {
      setConnectionState('disconnected');
    });

    const events = [
      'order:created',
      'order:accepted',
      'order:status_updated',
      'order:updated',
      'delivery:search_started',
      'delivery:offer_created',
      'delivery:offer_accepted',
      'delivery:offer_rejected',
      'delivery:offer_expired',
      'delivery:courier_assigned',
      'delivery:pickup_ready',
      'delivery:picked_up',
      'delivery:status_updated',
      'delivery:completed',
      'delivery:cancelled',
      'payment:confirmed',
      'payment:rejected',
      'payment:updated',
    ];

    for (const ev of events) {
      socket.on(ev, () => {
        refreshAll();
        if (ev === 'order:created' && params.notificationsEnabled !== false) {
          void window.uzbiteRestaurant?.notify({
            title: 'UzBite Restaurant · Новый заказ',
            body: 'Поступил новый заказ. Откройте раздел «Заказы».',
          });
        }
      });
    }

    socket.on('notification:created', (notice: { title?: string; body?: string }) => {
      refreshAll();
      if (params.notificationsEnabled !== false && notice?.title) {
        void window.uzbiteRestaurant?.notify({
          title: notice.title,
          body: notice.body ?? '',
        });
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [params.accessToken, params.apiBaseUrl, params.notificationsEnabled, params.restaurantId, queryClient]);

  return connectionState;
}
