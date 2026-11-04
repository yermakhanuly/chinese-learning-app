/**
 * Word topics. Must match the rows seeded in supabase/migrations/20261106000000_dictionary.sql
 * (a unit test checks). `hint` guides the AI tagging script (scripts/tag-topics.ts).
 * Relative imports only: Node runs the tagging script directly.
 */
export const TOPICS = [
  { slug: 'daily-life', name: 'Daily life', hint: 'routines, chores, common everyday actions and objects' },
  { slug: 'food', name: 'Food & drink', hint: 'food, drinks, cooking, restaurants, tastes' },
  { slug: 'people', name: 'Family & people', hint: 'family members, relationships, kinds of people, names for people' },
  { slug: 'body-health', name: 'Body & health', hint: 'body parts, illness, medicine, hospitals, fitness' },
  { slug: 'home', name: 'Home', hint: 'rooms, furniture, household items, housing' },
  { slug: 'clothing', name: 'Clothing', hint: 'clothes, shoes, accessories, getting dressed' },
  { slug: 'school', name: 'School & study', hint: 'school, university, learning, exams, subjects' },
  { slug: 'work', name: 'Work & business', hint: 'jobs, offices, companies, trade, management' },
  { slug: 'money', name: 'Money & shopping', hint: 'money, prices, buying and selling, banks, economy' },
  { slug: 'travel', name: 'Travel & transport', hint: 'trips, vehicles, traffic, hotels, tourism' },
  { slug: 'places', name: 'Places & directions', hint: 'locations, buildings, cities, countries, directions, positions' },
  { slug: 'time', name: 'Time & dates', hint: 'time words, dates, frequency, sequence (before/after)' },
  { slug: 'numbers', name: 'Numbers & measures', hint: 'numbers, quantities, measure words (classifiers), units' },
  { slug: 'nature', name: 'Weather & nature', hint: 'weather, seasons, landscape, environment' },
  { slug: 'animals', name: 'Animals & plants', hint: 'animals, plants, living things' },
  { slug: 'hobbies', name: 'Sports & hobbies', hint: 'sports, games, leisure activities' },
  { slug: 'arts', name: 'Arts & entertainment', hint: 'music, film, art, media, literature' },
  { slug: 'feelings', name: 'Feelings & attitudes', hint: 'emotions, moods, opinions, attitudes' },
  { slug: 'describing', name: 'Describing people & things', hint: 'appearance, personality, size, colour, qualities' },
  { slug: 'communication', name: 'Language & communication', hint: 'speaking, writing, languages, phones, messages' },
  { slug: 'society', name: 'Society & politics', hint: 'government, law, society, military, public affairs' },
  { slug: 'science-tech', name: 'Science & technology', hint: 'science, computers, internet, machines, research' },
  { slug: 'culture', name: 'Culture & history', hint: 'traditions, festivals, history, religion, customs' },
  { slug: 'ideas', name: 'Ideas & abstract words', hint: 'abstract nouns and verbs of thinking, reasoning, cause, change' },
  { slug: 'grammar', name: 'Grammar words', hint: 'particles, pronouns, conjunctions, prepositions, adverbs of degree, question words' },
] as const;

export type TopicSlug = (typeof TOPICS)[number]['slug'];
