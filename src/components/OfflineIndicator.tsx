import React, { useState, useEffect } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { WifiOff, Wifi, Database } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { getCurrentStorageEngine } from '@/utils/offlineStorage';

const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  const [storageEngine, setStorageEngine] = useState<string>('loading...');

  useEffect(() => {
    const updateEngine = () => {
      const engine = getCurrentStorageEngine();
      setStorageEngine(engine);
    };
    
    updateEngine();
    
    // Update periodically
    const interval = setInterval(updateEngine, 5000);
    return () => clearInterval(interval);
  }, []);

  const getStorageLabel = (engine: string) => {
    switch (engine) {
      case 'electron-sqlite':
        return 'SQLite';
      case 'indexeddb':
        return 'IndexedDB';
      case 'localstorage':
        return 'LocalStorage';
      default:
        return engine;
    }
  };

  return (
    <Alert className={`mb-4 ${isOnline ? 'border-green-200 bg-green-50' : 'border-orange-200 bg-orange-50'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          {isOnline ? (
            <Wifi className="h-4 w-4 text-green-600 mr-2" />
          ) : (
            <WifiOff className="h-4 w-4 text-orange-600 mr-2" />
          )}
          <AlertDescription className={isOnline ? 'text-green-800' : 'text-orange-800'}>
            {isOnline 
              ? 'Connected - Data will sync automatically' 
              : 'Offline mode - Changes saved locally'
            }
          </AlertDescription>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Database className="h-3 w-3" />
          <span>Storage: {getStorageLabel(storageEngine)}</span>
        </div>
      </div>
    </Alert>
  );
};

export default OfflineIndicator;
