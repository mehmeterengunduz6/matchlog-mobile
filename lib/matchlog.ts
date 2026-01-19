import AsyncStorage from '@react-native-async-storage/async-storage';

export type Stats = {
  weekCount: number;
  monthCount: number;
  totalCount: number;
};

export type EventItem = {
  eventId: string;
  leagueId: string;
  leagueName: string;
  date: string;
  time: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
};

export type LeagueGroup = {
  id: string;
  name: string;
  events: EventItem[];
};

export type WatchedEvent = EventItem & {
  createdAt: string;
};

export type Insights = {
  topTeam: string;
  topLeague: string;
  topWeekday: string;
  weekCount: number;
  monthCount: number;
  totalCount: number;
};

type SportsDbEvent = {
  idEvent: string;
  idLeague: string;
  strLeague: string;
  strEvent: string | null;
  strHomeTeam: string | null;
  strAwayTeam: string | null;
  intHomeScore: string | null;
  intAwayScore: string | null;
  dateEvent: string | null;
  strTime: string | null;
};

type SportsDbResponse = {
  events: SportsDbEvent[] | null;
};

type CacheEntry = {
  expiresAt: number;
  data: LeagueGroup[];
};

export type LeagueConfig = {
  id: string;
  name: string;
  query: string;
};

const STORAGE_KEY = 'matchlog.watched.v1';
const API_KEY = '123';
const BASE_URL = `https://www.thesportsdb.com/api/v1/json/${API_KEY}`;
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export const FEATURED_LEAGUES: LeagueConfig[] = [
  { id: '4328', name: 'English Premier League', query: 'English Premier League' },
  { id: '4335', name: 'Spanish La Liga', query: 'Spanish La Liga' },
  { id: '4332', name: 'Italian Serie A', query: 'Italian Serie A' },
  { id: '4331', name: 'German Bundesliga', query: 'German Bundesliga' },
  { id: '4334', name: 'French Ligue 1', query: 'French Ligue 1' },
  { id: '4339', name: 'Turkish Super Lig', query: 'Turkish Super Lig' },
  { id: '4480', name: 'UEFA Champions League', query: 'UEFA Champions League' },
];

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const busiestDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

function normalizeEvent(event: SportsDbEvent, league: LeagueConfig): EventItem | null {
  if (!event.idEvent || !event.dateEvent) {
    return null;
  }
  return {
    eventId: event.idEvent,
    leagueId: event.idLeague || league.id,
    leagueName: event.strLeague ?? league.name,
    date: event.dateEvent,
    time: event.strTime ?? '',
    homeTeam: event.strHomeTeam ?? 'TBD',
    awayTeam: event.strAwayTeam ?? 'TBD',
    homeScore: event.intHomeScore === null ? null : Number(event.intHomeScore),
    awayScore: event.intAwayScore === null ? null : Number(event.intAwayScore),
  };
}

async function fetchLeagueEvents(date: string, league: LeagueConfig) {
  const url = `${BASE_URL}/eventsday.php?d=${date}&l=${encodeURIComponent(
    league.query
  )}&s=Soccer`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`TheSportsDB error: ${res.status}`);
  }
  const data = (await res.json()) as SportsDbResponse;
  return (data.events ?? [])
    .map((event) => normalizeEvent(event, league))
    .filter((event): event is EventItem => Boolean(event));
}

export async function fetchEventsByDate(date: string) {
  const cached = cache.get(date);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const eventsByLeague = await Promise.all(
    FEATURED_LEAGUES.map((league) => fetchLeagueEvents(date, league))
  );

  const grouped = new Map<string, EventItem[]>();
  eventsByLeague.flat().forEach((event) => {
    if (!grouped.has(event.leagueId)) {
      grouped.set(event.leagueId, []);
    }
    grouped.get(event.leagueId)?.push(event);
  });

  const leagues = FEATURED_LEAGUES.map((league) => ({
    id: league.id,
    name: league.name,
    events: grouped.get(league.id) ?? [],
  }));

  cache.set(date, { expiresAt: Date.now() + CACHE_TTL_MS, data: leagues });
  return leagues;
}

export function todayValue() {
  return formatDate(new Date());
}

export function addDays(value: string, delta: number) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  date.setDate(date.getDate() + delta);
  return formatDate(date);
}

export function formatDate(date: Date) {
  const yyyy = date.getFullYear();
  const mm = `${date.getMonth() + 1}`.padStart(2, '0');
  const dd = `${date.getDate()}`.padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function startOfWeek(date: Date) {
  const day = date.getDay();
  const diff = (day + 6) % 7;
  const start = new Date(date);
  start.setDate(date.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

export function formatDisplayDate(value: string | Date) {
  const date =
    value instanceof Date
      ? value
      : value.includes('T')
      ? new Date(value)
      : new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return dateFormatter.format(date);
}

export function formatEventTime(date: string, time: string | null) {
  if (!time) {
    return 'TBD';
  }
  if (time.includes('T')) {
    const parsed = new Date(time);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    }
  }
  const iso = date ? `${date}T${time}Z` : '';
  if (iso) {
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    }
  }
  return time.length >= 5 ? time.slice(0, 5) : time;
}

export async function loadWatchedEvents() {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return [];
    }
    const parsed = JSON.parse(stored) as WatchedEvent[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed;
  } catch {
    return [];
  }
}

export async function saveWatchedEvents(events: WatchedEvent[]) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

export function toggleWatchedEvent(events: WatchedEvent[], event: EventItem) {
  const exists = events.some((item) => item.eventId === event.eventId);
  if (exists) {
    return events.filter((item) => item.eventId !== event.eventId);
  }
  return [
    ...events,
    {
      ...event,
      createdAt: new Date().toISOString(),
    },
  ];
}

export function computeStats(events: WatchedEvent[], now = new Date()): Stats {
  const weekStart = formatDate(startOfWeek(now));
  const monthStart = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
  let weekCount = 0;
  let monthCount = 0;

  events.forEach((event) => {
    const dayKey = localDateKey(event.date, event.time, event.createdAt);
    if (!dayKey) {
      return;
    }
    if (dayKey >= weekStart) {
      weekCount += 1;
    }
    if (dayKey >= monthStart) {
      monthCount += 1;
    }
  });

  return {
    weekCount,
    monthCount,
    totalCount: events.length,
  };
}

export function groupWatchedEvents(events: WatchedEvent[]) {
  const grouped = new Map<string, WatchedEvent[]>();
  events.forEach((event) => {
    const key = event.date || formatDate(new Date(event.createdAt));
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)?.push(event);
  });
  return Array.from(grouped.entries())
    .map(([date, items]) => ({
      date,
      items: items.sort((a, b) => a.time.localeCompare(b.time)),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function computeInsights(events: WatchedEvent[]): Insights {
  if (events.length === 0) {
    return {
      topTeam: '—',
      topLeague: '—',
      topWeekday: '—',
      weekCount: 0,
      monthCount: 0,
      totalCount: 0,
    };
  }

  const teamCounts = new Map<string, number>();
  const leagueCounts = new Map<string, number>();
  const dayCounts = new Map<string, number>();
  const now = new Date();
  const weekStart = formatDate(startOfWeek(now));
  const monthStart = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
  let weekCount = 0;
  let monthCount = 0;

  events.forEach((event) => {
    const teams = [event.homeTeam, event.awayTeam].filter(Boolean);
    teams.forEach((team) => {
      teamCounts.set(team, (teamCounts.get(team) ?? 0) + 1);
    });
    leagueCounts.set(event.leagueName, (leagueCounts.get(event.leagueName) ?? 0) + 1);
    const dayKey = localDateKey(event.date, event.time, event.createdAt);
    if (dayKey) {
      dayCounts.set(dayKey, (dayCounts.get(dayKey) ?? 0) + 1);
    }
    if (dayKey && dayKey >= weekStart) {
      weekCount += 1;
    }
    if (dayKey && dayKey >= monthStart) {
      monthCount += 1;
    }
  });

  function pickTop(map: Map<string, number>) {
    let topName = '—';
    let topValue = 0;
    map.forEach((value, key) => {
      if (value > topValue) {
        topName = key;
        topValue = value;
      }
    });
    return topName;
  }

  const busiestDayKey = pickTop(dayCounts);
  const busiestDay =
    busiestDayKey === '—'
      ? '—'
      : busiestDateFormatter.format(new Date(`${busiestDayKey}T00:00:00`));

  return {
    topTeam: pickTop(teamCounts),
    topLeague: pickTop(leagueCounts),
    topWeekday: busiestDay,
    weekCount,
    monthCount,
    totalCount: events.length,
  };
}

function localDateKey(date: string | null, time: string | null, createdAt: string) {
  if (date) {
    if (date.includes('T')) {
      const parsed = new Date(date);
      if (!Number.isNaN(parsed.getTime())) {
        return formatDate(parsed);
      }
    }
    if (time) {
      const parsed = new Date(`${date}T${time}Z`);
      if (!Number.isNaN(parsed.getTime())) {
        return formatDate(parsed);
      }
    }
    return date.slice(0, 10);
  }
  const fallback = new Date(createdAt);
  if (!Number.isNaN(fallback.getTime())) {
    return formatDate(fallback);
  }
  return null;
}
