import { Tabs } from 'expo-router';
import { View } from 'react-native';

import { AriaFab } from '@/components/aria-fab';
import { TabBar } from '@/components/tab-bar';

export default function TabsLayout() {
  return (
    <View className="flex-1">
      <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
        <Tabs.Screen name="index" options={{ title: 'Today' }} />
        <Tabs.Screen name="calendar" options={{ title: 'Calendar' }} />
        <Tabs.Screen name="tasks" options={{ title: 'Tasks' }} />
        <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      </Tabs>
      <AriaFab />
    </View>
  );
}
