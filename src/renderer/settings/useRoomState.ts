import { useEffect, useState } from 'react';
import type { RoomState } from '../../shared/room';
import { api } from './api';

export function useRoomState(): RoomState | null {
  const [room, setRoom] = useState<RoomState | null>(null);
  useEffect(() => {
    let pushed = false; // a pushed state is newer than a getRoom() reply that arrives after it
    const off = api.onRoom((s) => {
      pushed = true;
      setRoom(s);
    });
    void api.getRoom().then((s) => {
      if (!pushed) setRoom(s);
    });
    return off;
  }, []);
  return room;
}
