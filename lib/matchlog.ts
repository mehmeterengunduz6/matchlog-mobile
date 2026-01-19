import { fetchJson } from './api';

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

export type WatchedEvent = {
  id: number;
  eventId: string;
  leagueId: string;
  leagueName: string;
  date: string;
  time: string | null;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
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

export type EventsResponse = {
  leagues: LeagueGroup[];
  watchedIds: string[];
  stats: Stats;
};

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

export async function fetchEventsByDate(date: string) {
  const data = (await fetchJson(`/events?date=${date}`)) as EventsResponse;
  return data;
}

export async function fetchWatchedEvents() {
  const data = (await fetchJson('/watched/list')) as { events: WatchedEvent[] };
  return data.events;
}

export async function addWatchedEvent(event: EventItem) {
  await fetchJson('/watched', {
    method: 'POST',
    body: JSON.stringify({
      eventId: event.eventId,
      leagueId: event.leagueId,
      leagueName: event.leagueName,
      date: event.date,
      time: event.time,
      homeTeam: event.homeTeam,
      awayTeam: event.awayTeam,
      homeScore: event.homeScore,
      awayScore: event.awayScore,
    }),
  });
}

export async function removeWatchedEvent(eventId: string) {
  await fetchJson('/watched', {
    method: 'DELETE',
    body: JSON.stringify({ eventId }),
  });
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

export function updateStatsForToggle(stats: Stats, event: EventItem, isWatched: boolean) {
  const delta = isWatched ? -1 : 1;
  const today = new Date();
  const weekStart = formatDate(startOfWeek(today));
  const monthStart = formatDate(new Date(today.getFullYear(), today.getMonth(), 1));
  const isWeek = event.date >= weekStart;
  const isMonth = event.date >= monthStart;
  return {
    weekCount: stats.weekCount + (isWeek ? delta : 0),
    monthCount: stats.monthCount + (isMonth ? delta : 0),
    totalCount: stats.totalCount + delta,
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
      items: items.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '')),
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
