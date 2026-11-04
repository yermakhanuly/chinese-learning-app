import { router, type Href } from 'expo-router';
import { Pressable, type PressableProps } from 'react-native';

/**
 * A pressable card/row that navigates. `<Link asChild>` drops function styles (the pressed
 * state) on the web, so cards lost their layout; this keeps Pressable's styling on both platforms.
 */
export function PressableLink({ href, ...rest }: Omit<PressableProps, 'onPress' | 'role'> & { href: Href }) {
  return <Pressable role="link" onPress={() => router.push(href)} {...rest} />;
}
