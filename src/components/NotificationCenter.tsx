import { useState, useEffect, useRef } from 'react';
import { Bell, Check, CheckCheck, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useNotifications } from '@/hooks/useNotifications';
import { useRealTimeNotifications } from '@/hooks/useRealTimeNotifications';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

const NotificationCenter = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [hasNewPulse, setHasNewPulse] = useState(false);
  const prevUnreadRef = useRef(0);
  const navigate = useNavigate();

  const {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAsReadAsync,
    markAllAsRead,
  } = useNotifications();

  const { isConnected } = useRealTimeNotifications();

  // Trigger pulse animation when new notifications arrive
  useEffect(() => {
    if (unreadCount > prevUnreadRef.current && prevUnreadRef.current >= 0) {
      setHasNewPulse(true);
      const timer = setTimeout(() => setHasNewPulse(false), 3000);
      return () => clearTimeout(timer);
    }
    prevUnreadRef.current = unreadCount;
  }, [unreadCount]);

  // Live-updating relative timestamps
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'success':
      case 'signature_completed':
        return '✅';
      case 'warning':
      case 'signature_pending':
        return '⚠️';
      case 'error':
        return '❌';
      case 'document_generated':
        return '📄';
      case 'reminder':
      case 'contract_expiry':
        return '⏰';
      default:
        return 'ℹ️';
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'success':
      case 'signature_completed':
        return 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800';
      case 'warning':
      case 'signature_pending':
      // Aviso de vencimiento de vigencia (notify_expiring_sales). Sin este case
      // caía en el default gris y se leía como una notificación informativa más.
      case 'contract_expiry':
        return 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-800';
      case 'error':
        return 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800';
      case 'document_generated':
        return 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800';
      default:
        return 'bg-muted border-border';
    }
  };

  // Group notifications by date
  const groupedNotifications = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);

    const groups: { label: string; items: typeof notifications }[] = [
      { label: 'Hoy', items: [] },
      { label: 'Ayer', items: [] },
      { label: 'Anteriores', items: [] },
    ];

    notifications.forEach(n => {
      const d = new Date(n.created_at);
      if (d >= today) groups[0].items.push(n);
      else if (d >= yesterday) groups[1].items.push(n);
      else groups[2].items.push(n);
    });

    return groups.filter(g => g.items.length > 0);
  };

  const handleNotificationClick = async (notification: typeof notifications[0]) => {
    if (!notification.is_read) {
      try { await markAsReadAsync(notification.id); } catch {}
    }
    setIsOpen(false);
    if (notification.link) {
      navigate(notification.link);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className={`h-5 w-5 transition-transform ${hasNewPulse ? 'animate-bounce' : ''}`} />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className={`absolute -top-1 -right-1 h-5 min-w-5 flex items-center justify-center p-0 px-1 text-xs ${
                hasNewPulse ? 'animate-pulse ring-2 ring-destructive/50' : ''
              }`}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
          <div className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background ${
            isConnected ? 'bg-green-500' : 'bg-muted-foreground/40'
          }`} title={isConnected ? 'Conectado en tiempo real' : 'Desconectado'} />
        </Button>
      </PopoverTrigger>
      
      <PopoverContent className="w-[400px] p-0" align="end" sideOffset={8}>
        <Card className="border-0 shadow-2xl">
          <CardHeader className="pb-3 bg-muted/30">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                Notificaciones
                {isConnected && (
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-xs font-normal text-muted-foreground">En vivo</span>
                  </span>
                )}
              </CardTitle>
              <div className="flex gap-1">
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => markAllAsRead()}
                    className="text-xs h-7"
                  >
                    <CheckCheck className="h-3.5 w-3.5 mr-1" />
                    Leer todas
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsOpen(false)}
                  className="h-7 w-7"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {unreadCount > 0 && (
              <p className="text-sm text-muted-foreground">
                {unreadCount} sin leer
              </p>
            )}
          </CardHeader>
          
          <Separator />
          
          <CardContent className="p-0">
            <ScrollArea className="h-[420px]">
              {isLoading ? (
                <div className="p-6 text-center text-muted-foreground">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2" />
                  Cargando...
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Bell className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p className="font-medium mb-1">Sin notificaciones</p>
                  <p className="text-xs">Las nuevas notificaciones aparecerán aquí</p>
                </div>
              ) : (
                <div>
                  {groupedNotifications().map((group) => (
                    <div key={group.label}>
                      <div className="px-4 py-2 bg-muted/40 sticky top-0 z-10">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          {group.label}
                        </span>
                      </div>
                      <div className="divide-y divide-border/50">
                        {group.items.map((notification) => (
                          <div
                            key={notification.id}
                            onClick={() => handleNotificationClick(notification)}
                            className={`p-3 px-4 cursor-pointer transition-all duration-200 hover:bg-accent/50 ${
                              !notification.is_read 
                                ? 'bg-primary/5 border-l-2 border-l-primary' 
                                : 'border-l-2 border-l-transparent'
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm border ${
                                getNotificationColor(notification.type)
                              }`}>
                                {getNotificationIcon(notification.type)}
                              </div>
                              
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1">
                                    <h4 className={`text-sm leading-tight ${
                                      !notification.is_read ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground'
                                    }`}>
                                      {notification.title}
                                    </h4>
                                    {notification.message && (
                                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                        {notification.message}
                                      </p>
                                    )}
                                    <p className="text-[11px] text-muted-foreground/70 mt-1">
                                      {formatDistanceToNow(new Date(notification.created_at), {
                                        addSuffix: true,
                                        locale: es
                                      })}
                                    </p>
                                  </div>
                                  
                                  {!notification.is_read && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        markAsRead(notification.id);
                                      }}
                                      className="h-6 w-6 flex-shrink-0 opacity-0 group-hover:opacity-100 hover:opacity-100"
                                      title="Marcar como leída"
                                    >
                                      <Check className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </PopoverContent>
    </Popover>
  );
};

export default NotificationCenter;
