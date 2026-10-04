import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { Text } from 'react-native';

import { useMaybeGroup } from '@/store';
import { useTheme } from '@/ui/theme';

const icon = (emoji: string) =>
  function TabIcon({ focused }: { focused: boolean }) {
    return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }}>{emoji}</Text>;
  };

export default function TabsLayout() {
  const group = useMaybeGroup();
  const theme = useTheme();
  if (!group) return <Redirect href="/onboarding" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: { backgroundColor: theme.card, borderTopColor: theme.border },
        tabBarLabelStyle: { fontWeight: '600', fontSize: 11, lineHeight: 16 },
        sceneStyle: { backgroundColor: theme.background },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Inicio', tabBarIcon: icon('🏠') }} />
      <Tabs.Screen name="activity" options={{ title: 'Gastos', tabBarIcon: icon('🧾') }} />
      <Tabs.Screen name="bills" options={{ title: 'Fijos', tabBarIcon: icon('📅') }} />
      <Tabs.Screen name="goals" options={{ title: 'Metas', tabBarIcon: icon('🎯') }} />
      <Tabs.Screen name="summary" options={{ title: 'Resumen', tabBarIcon: icon('📊') }} />
    </Tabs>
  );
}
