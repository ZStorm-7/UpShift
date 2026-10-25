// Lets code outside a screen (the break timer, a deep link, a native event, the
// floating coach) navigate and ask where the user is. Created once and passed
// to <NavigationContainer ref=...>.

import { useEffect, useState } from 'react';
import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef<Record<string, object | undefined>>();

export function currentRouteName(): string | undefined {
  if (!navigationRef.isReady()) return undefined;
  return navigationRef.getCurrentRoute()?.name;
}

// The name of the screen on top, for components that live OUTSIDE any navigator.
// (`useNavigationState` throws there: it only works inside a screen. The floating
// coach used it and crashed the whole app on launch.)
export function useCurrentRouteName(): string | undefined {
  const [name, setName] = useState<string | undefined>(() => currentRouteName());
  useEffect(() => {
    const update = () => setName(currentRouteName());
    update();
    // Also fires for the first state, once the navigator mounts.
    const unsubscribe = navigationRef.addListener('state', update);
    return unsubscribe;
  }, []);
  return name;
}
