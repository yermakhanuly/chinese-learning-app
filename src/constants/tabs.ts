import type { SFSymbol } from 'expo-symbols';

export type TabDef = {
  /** Route file name in src/app ("index" = Home). */
  name: 'index' | 'learn' | 'review' | 'dictionary' | 'profile';
  href: '/' | '/learn' | '/review' | '/dictionary' | '/profile';
  label: string;
  sf: { default: SFSymbol; selected: SFSymbol };
  /** Material Symbols name used on web. */
  web: 'home' | 'school' | 'style' | 'search' | 'person';
};

export const TABS: TabDef[] = [
  { name: 'index', href: '/', label: 'Home', sf: { default: 'house', selected: 'house.fill' }, web: 'home' },
  { name: 'learn', href: '/learn', label: 'Learn', sf: { default: 'book', selected: 'book.fill' }, web: 'school' },
  {
    name: 'review',
    href: '/review',
    label: 'Review',
    sf: { default: 'rectangle.stack', selected: 'rectangle.stack.fill' },
    web: 'style',
  },
  {
    name: 'dictionary',
    href: '/dictionary',
    label: 'Dictionary',
    sf: { default: 'magnifyingglass', selected: 'magnifyingglass' },
    web: 'search',
  },
  {
    name: 'profile',
    href: '/profile',
    label: 'Profile',
    sf: { default: 'person.crop.circle', selected: 'person.crop.circle.fill' },
    web: 'person',
  },
];
