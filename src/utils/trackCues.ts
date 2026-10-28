import { Station, TrackCue } from '../types/radio';

export function getCurrentCue(station: Station, currentSeconds: number): TrackCue {
  if (!station.duration || station.duration <= 0) {
    return {
      start: 0,
      end: 0,
      song: station.name,
      artist: station.host || station.genre || 'GTA Live Radio',
      type: 'talk',
    };
  }

  const normalizedSeconds = ((currentSeconds % station.duration) + station.duration) % station.duration;

  const found = station.timestamps?.find(
    (cue) => cue.start <= normalizedSeconds && normalizedSeconds <= cue.end
  );

  if (found) {
    return found;
  }

  return {
    start: 0,
    end: station.duration,
    song: station.name,
    artist: station.host || station.genre || 'GTA Live Radio',
    type: 'talk',
  };
}
