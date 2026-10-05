# room-peer

A fake room member, for trying rooms with one computer. It joins a room, announces itself, drops random pings and prints the pings it receives.

```bash
node tools/room-peer/run.mjs PING-XXXXX-XXXXX --name Bot --rate 1
```

| Option | Default | |
| --- | --- | --- |
| `--name` | `Bot` | Name shown under its pings |
| `--color` | `4` | Tag colour, 0–7 |
| `--rate` | `1` | Pings per second; `0` only listens, `20` tests the spam limit |
| `--host` | `127.0.0.1` | Address of the machine running lolPing |
| `--port` | `47475` | This peer's own UDP port (lolPing uses 47474) |
| `--display` | `1` | Display number its pings target |

Start lolPing, create a room, copy the code and run the command with it. Several peers can run at once on different ports.
